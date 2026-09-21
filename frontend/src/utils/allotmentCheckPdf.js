import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import { maskPan } from './format';

const APP_NAME = 'IPO Team Manager';
const DEVELOPER_NAME = 'Lokendra';
const MARGIN = 12;
const HEADER_H = 22;
const FOOTER_H = 10;

const STATUS_LABEL = {
  ALLOTED: 'Allotted',
  PARTIALLY_ALLOTTED: 'Partial',
  NOT_ALLOTED: 'Not allotted',
  PENDING: 'Pending',
  CHECKING: 'Checking',
  RETRY: 'Retry',
  ERROR: 'Error',
  REJECTED: 'Rejected',
  NOT_APPLIED: 'Not applied',
};

export function allotmentStatusOf(row) {
  return row?.allotmentStatus || row?.allotment_status || 'PENDING';
}

export function isAllottedStatus(status) {
  return status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED';
}

function memberWord(n) {
  return Number(n) === 1 ? 'member' : 'members';
}

export function membersOutOfApplied(count, total) {
  const n = Number(count) || 0;
  const t = Number(total) || 0;
  return `${n} ${memberWord(n)} out of ${t} applied ${memberWord(t)}`;
}

export function summarizeAllotmentRows(applications = [], waitingForListing = false) {
  const counts = {
    total: applications.length,
    allotted: 0,
    notAllotted: 0,
    pending: 0,
    checked: 0,
  };
  for (const row of applications) {
    const status = allotmentStatusOf(row);
    if (isAllottedStatus(status)) counts.allotted += 1;
    else if (status === 'NOT_ALLOTED') counts.notAllotted += 1;
    else if (status === 'PENDING' || status === 'CHECKING' || status === 'RETRY' || status === 'ERROR') {
      counts.pending += 1;
    }
    if (status !== 'PENDING' && status !== 'CHECKING' && status !== 'RETRY') counts.checked += 1;
  }
  const allottedLabel = waitingForListing ? 'waiting for listing' : 'allotted';
  const summary = [
    membersOutOfApplied(counts.checked, counts.total),
    `checked · ${counts.allotted} ${allottedLabel} · ${counts.notAllotted} not allotted`,
    counts.pending ? `· ${counts.pending} pending` : '',
  ].filter(Boolean).join(' ');
  return { counts, summary };
}

function money(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `Rs.${Math.round(n).toLocaleString('en-IN')}`;
}

function statusLabel(status, waitingForListing) {
  if (waitingForListing && isAllottedStatus(status)) return 'Waiting for listing';
  return STATUS_LABEL[status] || status || '-';
}

function panLabel(row) {
  return row.maskedPan || row.masked_pan || maskPan(row.pan) || '-';
}

function normalizeRow(row) {
  return {
    name: row.name || row.display_name || '-',
    pan: panLabel(row),
    appliedAmount: row.appliedAmount ?? row.amount ?? null,
    allottedLots: row.allottedLots ?? row.allotted_lots ?? null,
    status: allotmentStatusOf(row),
    checkedAt: row.checkedAt || row.allotment_checked_at || null,
  };
}

function statusRank(status) {
  if (isAllottedStatus(status)) return 0;
  if (status === 'NOT_ALLOTED') return 1;
  if (status === 'ERROR' || status === 'RETRY') return 2;
  if (status === 'PENDING' || status === 'CHECKING') return 3;
  return 4;
}

function safeFilePart(value) {
  return String(value || 'ipo')
    .replace(/[^\w\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'ipo';
}

function drawHeader(doc, { teamName, title, subtitle }) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(13, 148, 136);
  doc.rect(0, 0, w, HEADER_H, 'F');
  doc.setTextColor(204, 251, 241);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(APP_NAME, MARGIN, 7);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(String(teamName || 'IPO Team'), MARGIN, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(240, 253, 250);
  doc.text(String(title || ''), MARGIN, 19.5);
  if (subtitle) {
    doc.setFontSize(7);
    doc.text(String(subtitle), w - MARGIN, 19.5, { align: 'right' });
  }
}

function drawFooter(doc) {
  const pageCount = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, h - FOOTER_H, w - MARGIN, h - FOOTER_H);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${APP_NAME} | Developed by ${DEVELOPER_NAME}`, MARGIN, h - 4);
    doc.text(`Page ${i} of ${pageCount}`, w - MARGIN, h - 4, { align: 'right' });
  }
}

export function buildAllotmentCheckPdf({ ipoName, applications = [], waitingForListing = false }, meta = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const teamName = meta.teamName || 'IPO Team';
  const generated = dayjs(meta.generatedAt || undefined).format('DD MMM YYYY, hh:mm A');
  const rows = applications.map(normalizeRow).sort((a, b) => {
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) return rank;
    return String(a.name).localeCompare(String(b.name));
  });
  const { counts, summary } = summarizeAllotmentRows(applications, waitingForListing);
  const title = `${ipoName || 'IPO'} — Allotment check`;

  drawHeader(doc, { teamName, title, subtitle: generated });

  let y = HEADER_H + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(title, MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(summary, MARGIN, y, { maxWidth: doc.internal.pageSize.getWidth() - MARGIN * 2 });
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_H + 4 },
    head: [['#', 'Member', 'PAN', 'Applied', 'Lots', 'Status']],
    body: rows.map((row, i) => [
      String(i + 1),
      row.name,
      row.pan,
      money(row.appliedAmount),
      isAllottedStatus(row.status) && row.allottedLots != null ? String(row.allottedLots) : '-',
      statusLabel(row.status, waitingForListing),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    columnStyles: {
      0: { cellWidth: 12, halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'center', cellWidth: 16 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 5) return;
      const label = String(data.cell.raw || '');
      if (label === 'Allotted' || label === 'Partial' || label === 'Waiting for listing') {
        data.cell.styles.textColor = [4, 120, 87];
        data.cell.styles.fontStyle = 'bold';
      } else if (label === 'Not allotted') {
        data.cell.styles.textColor = [185, 28, 28];
      }
    },
  });

  drawFooter(doc);
  const fileName = `allotment-check-${safeFilePart(ipoName)}-${dayjs().format('YYYY-MM-DD')}.pdf`;
  return { doc, fileName, counts, summary };
}

export function downloadAllotmentCheckPdf(payload, meta = {}) {
  const { doc, fileName } = buildAllotmentCheckPdf(payload, meta);
  doc.save(fileName);
  return fileName;
}

export function allotmentCheckPdfBase64(payload, meta = {}) {
  const built = buildAllotmentCheckPdf(payload, meta);
  const dataUri = built.doc.output('datauristring');
  const pdfBase64 = dataUri.split(',')[1];
  return { ...built, pdfBase64 };
}
