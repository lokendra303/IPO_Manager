import dayjs from 'dayjs';
import { htmlToPdfBase64 } from './emailPdf';
import { maskPan } from './format';

const APP_NAME = 'IPO Team Manager';
const DEVELOPER_NAME = 'Lokendra';

const STATUS_LABEL: Record<string, string> = {
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

export type AllotmentPdfRow = {
  name?: string;
  display_name?: string;
  maskedPan?: string;
  masked_pan?: string;
  pan?: string;
  appliedAmount?: number | null;
  amount?: number | null;
  allottedLots?: number | null;
  allotted_lots?: number | null;
  allotmentStatus?: string;
  allotment_status?: string;
};

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function memberWord(n: number) {
  return Number(n) === 1 ? 'member' : 'members';
}

export function membersOutOfApplied(count: number, total: number) {
  const n = Number(count) || 0;
  const t = Number(total) || 0;
  return `${n} ${memberWord(n)} out of ${t} applied ${memberWord(t)}`;
}

export function allotmentStatusOf(row: AllotmentPdfRow) {
  return row?.allotmentStatus || row?.allotment_status || 'PENDING';
}

export function isAllottedStatus(status: string) {
  return status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED';
}

export function summarizeAllotmentRows(applications: AllotmentPdfRow[] = [], waitingForListing = false) {
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

function money(v: unknown) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `Rs.${Math.round(n).toLocaleString('en-IN')}`;
}

function panLabel(row: AllotmentPdfRow) {
  return row.maskedPan || row.masked_pan || maskPan(row.pan) || '-';
}

function statusLabel(status: string, waitingForListing: boolean) {
  if (waitingForListing && isAllottedStatus(status)) return 'Waiting for listing';
  return STATUS_LABEL[status] || status || '-';
}

function statusRank(status: string) {
  if (isAllottedStatus(status)) return 0;
  if (status === 'NOT_ALLOTED') return 1;
  if (status === 'ERROR' || status === 'RETRY') return 2;
  if (status === 'PENDING' || status === 'CHECKING') return 3;
  return 4;
}

function safeFilePart(value: unknown) {
  return String(value || 'ipo')
    .replace(/[^\w\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'ipo';
}

export function buildAllotmentCheckHtml(
  payload: { ipoName?: string; applications?: AllotmentPdfRow[]; waitingForListing?: boolean },
  meta: { teamName?: string; generatedAt?: string } = {}
) {
  const teamName = meta.teamName || 'IPO Team';
  const generated = dayjs(meta.generatedAt || undefined).format('DD MMM YYYY, hh:mm A');
  const waitingForListing = Boolean(payload.waitingForListing);
  const rows = [...(payload.applications || [])].sort((a, b) => {
    const rank = statusRank(allotmentStatusOf(a)) - statusRank(allotmentStatusOf(b));
    if (rank !== 0) return rank;
    return String(a.name || a.display_name || '').localeCompare(String(b.name || b.display_name || ''));
  });
  const { summary } = summarizeAllotmentRows(payload.applications || [], waitingForListing);
  const title = `${payload.ipoName || 'IPO'} — Allotment check`;
  const body = rows.map((row, i) => {
    const status = allotmentStatusOf(row);
    const lots = isAllottedStatus(status) && (row.allottedLots ?? row.allotted_lots) != null
      ? String(row.allottedLots ?? row.allotted_lots)
      : '-';
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(row.name || row.display_name || '-')}</td>
      <td>${esc(panLabel(row))}</td>
      <td class="r">${esc(money(row.appliedAmount ?? row.amount))}</td>
      <td class="c">${esc(lots)}</td>
      <td>${esc(statusLabel(status, waitingForListing))}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 16px; }
    .header { background: #0d9488; color: #fff; padding: 12px 14px; margin: -16px -16px 14px; }
    .app { font-size: 9px; color: #ccfbf1; }
    .team { font-size: 16px; font-weight: bold; margin-top: 2px; }
    .title { font-size: 11px; margin-top: 4px; }
    .summary { color: #475569; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 6px; }
    th { background: #0f766e; color: #fff; text-align: left; }
    td.c, th.c { text-align: center; }
    td.r { text-align: right; }
    tr:nth-child(even) td { background: #f0fdfa; }
    .footer { margin-top: 12px; padding-top: 6px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="app">${esc(APP_NAME)}</div>
    <div class="team">${esc(teamName)}</div>
    <div class="title">${esc(title)} · ${esc(generated)}</div>
  </div>
  <p class="summary">${esc(summary)}</p>
  <table>
    <thead>
      <tr>
        <th class="c">#</th>
        <th>Member</th>
        <th>PAN</th>
        <th>Applied</th>
        <th class="c">Lots</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <div class="footer">${esc(APP_NAME)} | Developed by ${esc(DEVELOPER_NAME)}</div>
</body>
</html>`;
}

export async function allotmentCheckPdfBase64(
  payload: { ipoName?: string; applications?: AllotmentPdfRow[]; waitingForListing?: boolean },
  meta: { teamName?: string; generatedAt?: string } = {}
) {
  const html = buildAllotmentCheckHtml(payload, meta);
  const pdfBase64 = await htmlToPdfBase64(html);
  const fileName = `allotment-check-${safeFilePart(payload.ipoName)}-${dayjs().format('YYYY-MM-DD')}.pdf`;
  const { summary } = summarizeAllotmentRows(payload.applications || [], Boolean(payload.waitingForListing));
  return { pdfBase64, fileName, summary };
}
