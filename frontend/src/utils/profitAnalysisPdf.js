import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';

const APP_NAME = 'IPO Team Manager';
const DEVELOPER_NAME = 'Lokendra';
const MARGIN = 10;
const HEADER_H = 22;
const FOOTER_H = 10;
const GAP = 4;
const SECTION_NEED = 20;

function money(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const rounded = Math.round(n * 100) / 100;
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  if (Number.isInteger(abs)) return `${sign}Rs.${abs}`;
  return `${sign}Rs.${abs.toFixed(2)}`;
}

function pageWidth(doc) {
  return doc.internal.pageSize.getWidth();
}

function pageHeight(doc) {
  return doc.internal.pageSize.getHeight();
}

function contentWidth(doc) {
  return pageWidth(doc) - MARGIN * 2;
}

function drawReportHeader(doc, { teamName, title, subtitle }) {
  const w = pageWidth(doc);
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, w, HEADER_H, 'F');

  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(APP_NAME, MARGIN, 7);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(String(teamName || 'IPO Team'), MARGIN, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(226, 232, 240);
  doc.text(String(title || ''), MARGIN, 19.5);

  if (subtitle) {
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(String(subtitle), w - MARGIN, 19.5, { align: 'right' });
  }
}

function drawReportFooter(doc) {
  const pageCount = doc.getNumberOfPages();
  const w = pageWidth(doc);
  const h = pageHeight(doc);
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

function cursorY(doc, currentY) {
  const afterTable = doc.lastAutoTable?.finalY != null
    ? doc.lastAutoTable.finalY + GAP
    : HEADER_H + 4;
  return Math.max(Number(currentY) || 0, afterTable);
}

/** Page-break only when needed; otherwise stay tight under previous content. */
function ensureSpace(doc, currentY, needed = SECTION_NEED) {
  const h = pageHeight(doc);
  let y = cursorY(doc, currentY);
  if (y + needed > h - FOOTER_H - 4) {
    doc.addPage();
    return HEADER_H + 4;
  }
  return y;
}

/** Compact separator + section title (space between separator and heading only). */
function beginSection(doc, currentY, title, needed = SECTION_NEED) {
  let y = ensureSpace(doc, currentY, needed);
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.9);
  doc.line(MARGIN, y, MARGIN + contentWidth(doc), y);
  y += 1.2;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, MARGIN + contentWidth(doc), y);
  // Breathing room: separator -> heading (not heading -> table)
  y += 5.5;

  const maxW = contentWidth(doc);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const lines = doc.splitTextToSize(asciiPdfText(title), maxW);
  doc.text(lines, MARGIN, y);
  // Keep heading tight above the list/table
  return y + lines.length * 3.4 + 0.8;
}

function asciiPdfText(text) {
  return String(text ?? '')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u00B7\u2022\u2023]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, ' ');
}

function metaLine(doc, y, pairs) {
  const colW = contentWidth(doc) / Math.min(pairs.length, 4);
  pairs.forEach((pair, i) => {
    const x = MARGIN + colW * i;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${pair.label}:`, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(String(pair.value), x, y + 3.2);
  });
  return y + 7.5;
}

function columnStylesFrom(tableW, cols) {
  const totalWeight = cols.reduce((s, c) => s + c.weight, 0);
  const styles = {};
  let used = 0;
  cols.forEach((col, i) => {
    let w;
    if (i === cols.length - 1) {
      w = Math.round((tableW - used) * 100) / 100;
    } else {
      w = Math.round(tableW * (col.weight / totalWeight) * 100) / 100;
      used += w;
    }
    styles[i] = { cellWidth: w, halign: col.align, valign: 'middle' };
  });
  return styles;
}

function drawTable(doc, { startY, head, body, columns, fontSize = 7 }) {
  const tableW = contentWidth(doc);
  const aligns = columns.map((c) => c.align);
  autoTable(doc, {
    startY,
    head,
    body,
    tableWidth: tableW,
    margin: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: FOOTER_H + 3 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontStyle: 'normal',
      fontSize,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2.2, right: 2.2 },
      valign: 'middle',
      overflow: 'linebreak',
      lineColor: [190, 190, 190],
      lineWidth: 0.15,
      textColor: [20, 20, 20],
      minCellHeight: 5.5,
    },
    headStyles: {
      fillColor: [50, 50, 50],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize,
      valign: 'middle',
      cellPadding: { top: 1.7, bottom: 1.7, left: 2.2, right: 2.2 },
    },
    alternateRowStyles: { fillColor: [246, 246, 246] },
    columnStyles: columnStylesFrom(tableW, columns),
    didParseCell: (data) => {
      const align = aligns[data.column.index];
      if (align) data.cell.styles.halign = align;
      if (
        data.section === 'body'
        && String(data.row.raw?.[0] || '').toUpperCase().startsWith('TOTAL')
      ) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  return (doc.lastAutoTable?.finalY ?? startY) + GAP;
}

const L = (w) => ({ align: 'left', weight: w });
const C = (w) => ({ align: 'center', weight: w });
const R = (w) => ({ align: 'right', weight: w });

/**
 * Build the profit analysis PDF document (does not save or open).
 * @param {object} analysis - GET /profit-shares/analysis payload
 * @param {{ teamName?: string, generatedAt?: string }} meta
 * @returns {{ doc: import('jspdf').jsPDF, fileName: string }}
 */
export function buildProfitAnalysisPdf(analysis, meta = {}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const teamName = meta.teamName || 'IPO Team';
  const generated = dayjs(meta.generatedAt || undefined).format('DD MMM YYYY, hh:mm A');
  const overall = analysis?.overall || {};
  const revenue = analysis?.revenue || {};
  const manager = analysis?.manager || {};
  const reportScope = analysis?.reportScope || {};
  const applicationCount = Number(
    reportScope.applicationCount ?? revenue.applicationCount ?? overall.applicationCount ?? 0
  );
  const profitApps = Number(reportScope.profitApps ?? overall.profitApps ?? 0);
  const lossApps = Number(reportScope.lossApps ?? overall.lossApps ?? 0);
  const flatApps = Number(reportScope.flatApps ?? overall.flatApps ?? 0);
  const iposApplied = Number(reportScope.iposApplied ?? overall.iposApplied ?? 0);
  const iposProfit = Number(reportScope.iposProfit ?? overall.iposProfit ?? 0);
  const appsLabel =
    reportScope.applicationsLabel
    || (applicationCount === 1 ? '1 application' : `${applicationCount} applications`);
  const iposAppliedLabel =
    reportScope.iposAppliedLabel
    || (iposApplied === 1 ? '1 IPO applied' : `${iposApplied} IPOs applied`);
  const iposProfitLabel =
    reportScope.iposProfitLabel
    || (iposProfit === 1 ? '1 IPO gave profit' : `${iposProfit} IPOs gave profit`);
  const periodLabel =
    reportScope.filters?.label
    || reportScope.periodLabel
    || 'All time';
  const members = analysis?.members || [];
  const providers = analysis?.providers || [];
  const subGroups = analysis?.subGroups || [];
  const bySegment = analysis?.bySegment || [];
  const byCategory = analysis?.byCategory || [];
  const ungrouped = analysis?.ungroupedMembers || [];

  drawReportHeader(doc, {
    teamName,
    title: `Profit analysis report - ${periodLabel}`,
    subtitle: generated,
  });

  let y = HEADER_H + 4;
  y = beginSection(doc, y, `Coverage (${periodLabel})`);
  y = drawTable(doc, {
    startY: y,
    head: [['IPOs applied', 'IPOs gave profit', 'Active apps', 'Apps gave profit']],
    body: [[String(iposApplied), String(iposProfit), String(applicationCount), String(profitApps)]],
    columns: [C(1), C(1), C(1), C(1)],
  });
  y = metaLine(doc, y, [
    { label: 'Apps gave loss', value: String(lossApps) },
    { label: 'Break-even apps', value: String(flatApps) },
    { label: 'Gross IPO P&L', value: money(overall.grossIpoPnL) },
    { label: 'Member revenue', value: money(revenue.memberShare) },
  ]);
  y = metaLine(doc, y, [
    { label: 'Manager revenue', value: money(revenue.managerShare) },
    { label: 'Provider revenue', value: money(revenue.providerShare) },
    { label: 'Gross split (done)', value: money(revenue.grossDistributed) },
    { label: 'Pending to split', value: money(revenue.pendingGross) },
  ]);

  y = beginSection(doc, y, '1. Revenue overview (who keeps the profit)');
  y = drawTable(doc, {
    startY: y,
    head: [['Party', 'Share / revenue', 'Notes']],
    body: [
      ['Members (kept)', money(revenue.memberShare), 'Sum of member_amount from P&L splits'],
      ['Manager (you)', money(revenue.managerShare), `${money(manager.profitShare)} from profit - ${money(manager.lossShare)} from loss`],
      ['Fund providers', money(revenue.providerShare), 'Accrued / paid to providers via share rules'],
      ['TOTAL distributed', money(revenue.grossDistributed), 'Member + manager + provider'],
    ],
    columns: [L(2.2), R(1.6), L(4)],
  });

  y = beginSection(doc, y, '2. By IPO segment');
  y = drawTable(doc, {
    startY: y,
    head: [['Segment', 'Gross split', 'Member', 'Manager', 'Provider', 'Splits']],
    body: bySegment.length
      ? bySegment.map((r) => [
          r.label || r.ipoSegment,
          money(r.grossDistributed),
          money(r.memberShare),
          money(r.managerShare),
          money(r.providerShare),
          String(r.distributionCount ?? 0),
        ])
      : [['-', '-', '-', '-', '-', '-']],
    columns: [L(1.6), R(1.4), R(1.3), R(1.3), R(1.3), C(0.9)],
  });

  y = beginSection(doc, y, '3. By investor category (RII / HNI)');
  y = drawTable(doc, {
    startY: y,
    head: [['Category', 'Gross split', 'Member', 'Manager', 'Provider', 'Splits']],
    body: byCategory.length
      ? byCategory.map((r) => [
          r.label || r.investorCategory,
          money(r.grossDistributed),
          money(r.memberShare),
          money(r.managerShare),
          money(r.providerShare),
          String(r.distributionCount ?? 0),
        ])
      : [['-', '-', '-', '-', '-', '-']],
    columns: [L(1.6), R(1.4), R(1.3), R(1.3), R(1.3), C(0.9)],
  });

  y = beginSection(doc, y, '4. Member-wise profit detail', 22);
  y = drawTable(doc, {
    startY: y,
    fontSize: 6.5,
    head: [[
      'Member', 'PAN', 'Sub-group', 'Gross P&L', 'Member keeps', 'Manager', 'Provider', 'Pending split',
    ]],
    body: members.length
      ? members.map((r) => [
          asciiPdfText(`${r.displayName || '-'}${r.isGroupLeader ? ' (Leader)' : ''}`),
          asciiPdfText(r.pan || '-'),
          asciiPdfText(r.memberGroupName || '-'),
          money(r.grossIpoPnL),
          money(r.memberShare),
          money(r.managerShare),
          money(r.providerShare),
          Number(r.pendingGross) ? money(r.pendingGross) : '-',
        ])
      : [['-', 'No allotted IPO P&L yet', '-', '-', '-', '-', '-', '-']],
    columns: [L(1.8), C(1.1), L(1.4), R(1.1), R(1.1), R(1), R(1), R(1.1)],
  });

  y = beginSection(doc, y, '5. Fund provider share detail');
  y = drawTable(doc, {
    startY: y,
    head: [['Provider', 'Total share', 'From profit', 'From loss', 'Splits']],
    body: providers.length
      ? providers.map((r) => [
          asciiPdfText(r.providerName || '-'),
          money(r.totalShare),
          money(r.profitShare),
          money(r.lossShare),
          String(r.distributionCount ?? 0),
        ])
      : [['-', 'No provider shares yet', '-', '-', '-']],
    columns: [L(3), R(1.5), R(1.5), R(1.5), C(1)],
  });

  y = beginSection(doc, y, '6. Manager (your) share');
  y = drawTable(doc, {
    startY: y,
    head: [['Item', 'Amount']],
    body: [
      ['Total manager share', money(manager.totalShare)],
      ['From profit splits', money(manager.profitShare)],
      ['From loss splits', money(manager.lossShare)],
    ],
    columns: [L(4), R(2)],
  });

  y = beginSection(doc, y, '7. Sub-group leader rollups', 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  const noteLines = doc.splitTextToSize(
    'Member profit attributed per member. Group totals = sum vs each leader (not transferred to leader).',
    contentWidth(doc)
  );
  doc.text(noteLines, MARGIN, y);
  y += noteLines.length * 3.2 + 1.2;

  if (!subGroups.length) {
    y = drawTable(doc, {
      startY: y,
      head: [['Note']],
      body: [['No sub-groups with members.']],
      columns: [L(6)],
    });
  } else {
    for (const g of subGroups) {
      y = beginSection(
        doc,
        y,
        asciiPdfText(
          `${g.groupName || 'Group'} - Leader: ${g.leaderDisplayName || '-'} (${g.memberCount || 0} members)`
        ),
        24
      );
      y = drawTable(doc, {
        startY: y,
        fontSize: 6.5,
        head: [['Member', 'Role', 'Gross P&L', 'Member profit', 'Manager', 'Provider']],
        body: [
          ...(g.members || []).map((m) => [
            asciiPdfText(m.displayName || '-'),
            m.isLeader ? 'Leader' : 'Member',
            money(m.grossIpoPnL),
            money(m.memberShare),
            money(m.managerShare),
            money(m.providerShare),
          ]),
          [
            asciiPdfText(`TOTAL vs ${g.leaderDisplayName || 'leader'}`),
            '',
            money(g.totals?.grossIpoPnL),
            money(g.totals?.memberShare),
            money(g.totals?.managerShare),
            money(g.totals?.providerShare),
          ],
        ],
        columns: [L(2.2), C(1), R(1.3), R(1.4), R(1.2), R(1.2)],
      });
    }
  }

  if (ungrouped.length) {
    y = beginSection(doc, y, '8. Members not in a sub-group', 22);
    y = drawTable(doc, {
      startY: y,
      fontSize: 6.5,
      head: [['Member', 'PAN', 'Gross P&L', 'Member keeps', 'Manager', 'Provider']],
      body: ungrouped.map((r) => [
        asciiPdfText(r.displayName || '-'),
        asciiPdfText(r.pan || '-'),
        money(r.grossIpoPnL),
        money(r.memberShare),
        money(r.managerShare),
        money(r.providerShare),
      ]),
      columns: [L(2), C(1.2), R(1.3), R(1.3), R(1.2), R(1.2)],
    });
  }

  y = ensureSpace(doc, y, 14);
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.9);
  doc.line(MARGIN, y, MARGIN + contentWidth(doc), y);
  y += 1.2;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, MARGIN + contentWidth(doc), y);
  y += 5.5;

  const summaryLines = doc.splitTextToSize(
    `Summary (${iposAppliedLabel}, ${iposProfitLabel}, ${appsLabel}: ${profitApps} apps profit / ${lossApps} loss): Member ${money(revenue.memberShare)}  |  Manager ${money(revenue.managerShare)}  |  Provider ${money(revenue.providerShare)}  |  Gross ${money(overall.grossIpoPnL)}`,
    contentWidth(doc)
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(summaryLines, MARGIN, y);
  y += summaryLines.length * 3.6 + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  const footerNote = doc.splitTextToSize(
    'Note: Profit stays on each application member. Sub-group totals sum members under that leader (not transferred to the leader).',
    contentWidth(doc)
  );
  doc.text(footerNote, MARGIN, y);

  drawReportFooter(doc);

  const safeTeam = String(teamName).replace(/[^\w\-]+/g, '_');
  const fileName = `profit-analysis-${safeTeam}-${dayjs().format('YYYY-MM-DD')}.pdf`;
  return { doc, fileName };
}

/** Download profit analysis PDF. */
export function downloadProfitAnalysisPdf(analysis, meta = {}) {
  const { doc, fileName } = buildProfitAnalysisPdf(analysis, meta);
  doc.save(fileName);
  return fileName;
}

/**
 * Build a blob URL for in-app / new-tab preview.
 * Caller should revoke the URL when done (e.g. on modal close).
 */
export function createProfitAnalysisPdfPreviewUrl(analysis, meta = {}) {
  const { doc, fileName } = buildProfitAnalysisPdf(analysis, meta);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  return { url, fileName, blob };
}

/** Open PDF in a new browser tab for quick preview. */
export function openProfitAnalysisPdfPreview(analysis, meta = {}) {
  const { url, fileName } = createProfitAnalysisPdfPreviewUrl(analysis, meta);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('Pop-up blocked - allow pop-ups to preview the report');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return fileName;
}
