import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import dayjs from 'dayjs';

const APP_NAME = 'IPO Team Manager';
const DEVELOPER_NAME = 'Lokendra';

function money(v: unknown): string {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const rounded = Math.round(n * 100) / 100;
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  if (Number.isInteger(abs)) return `${sign}Rs.${abs}`;
  return `${sign}Rs.${abs.toFixed(2)}`;
}

function dash() {
  return '-';
}

function statusLabel(status: unknown): string {
  const s = String(status || '').replace(/_/g, ' ').trim();
  if (!s) return '-';
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function round2(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type AppRow = {
  ipoName?: string;
  allotmentStatus?: string;
  amount?: number;
  fundReturned?: boolean;
  grossProfitLoss?: number | null;
  memberShare?: number | null;
  memberName?: string;
};

type IpoSummaryRow = {
  ipoName: string;
  applications: number;
  allotted: number;
  notAllotted: number;
  pending: number;
  fundGiven: number;
  grossPnL: number;
  memberProfit: number;
};

function buildIpoProfitSummary(apps: AppRow[]): IpoSummaryRow[] {
  const map = new Map<string, IpoSummaryRow>();
  for (const app of apps) {
    const key = app.ipoName || 'Unknown IPO';
    const row = map.get(key) ?? {
      ipoName: key,
      applications: 0,
      allotted: 0,
      notAllotted: 0,
      pending: 0,
      fundGiven: 0,
      grossPnL: 0,
      memberProfit: 0,
    };
    row.applications += 1;
    row.fundGiven = round2(row.fundGiven + Number(app.amount || 0));
    const status = app.allotmentStatus;
    if (status === 'ALLOTED') {
      row.allotted += 1;
      if (app.grossProfitLoss != null) row.grossPnL = round2(row.grossPnL + Number(app.grossProfitLoss));
      if (app.memberShare != null) row.memberProfit = round2(row.memberProfit + Number(app.memberShare));
    } else if (status === 'NOT_ALLOTED' || status === 'NOT_APPLIED') {
      row.notAllotted += 1;
    } else if (status === 'PENDING') {
      row.pending += 1;
    }
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.ipoName.localeCompare(b.ipoName));
}

function countAllotments(apps: AppRow[]) {
  return apps.reduce(
    (acc, app) => {
      acc.applied += 1;
      if (app.allotmentStatus === 'ALLOTED') acc.allotted += 1;
      else if (app.allotmentStatus === 'PENDING') acc.pending += 1;
      else if (app.allotmentStatus === 'NOT_ALLOTED' || app.allotmentStatus === 'NOT_APPLIED') {
        acc.notAllotted += 1;
      }
      return acc;
    },
    { applied: 0, allotted: 0, pending: 0, notAllotted: 0 }
  );
}

function table(headers: string[], rows: string[][], opts?: { moneyCols?: number[] }) {
  const moneyCols = new Set(opts?.moneyCols ?? []);
  const centerAll = true;
  const th = headers
    .map((h, i) => `<th class="${moneyCols.has(i) || centerAll ? 'c' : 'l'}">${esc(h)}</th>`)
    .join('');
  const body = rows
    .map((row) => {
      const tds = row
        .map((cell, i) => {
          const isTotal = String(row[0]).toUpperCase() === 'TOTAL';
          const cls = [
            moneyCols.has(i) || centerAll ? 'c' : 'l',
            isTotal ? 'bold' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<td class="${cls}">${esc(cell)}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

export type GroupPdfPayload = {
  isLeader: boolean;
  teamName?: string;
  groupName?: string;
  leaderName?: string;
  groupStats?: Record<string, number | undefined>;
  groupApplications?: AppRow[];
  members?: Array<{
    displayName?: string;
    pan?: string;
    iposApplied?: number;
    iposAlloted?: number;
    pendingReturn?: number;
    totalMemberShare?: number;
    isLeader?: boolean;
  }>;
};

export type StatementPdfPayload = {
  teamName?: string;
  generatedAt?: string;
  member?: {
    displayName?: string;
    pan?: string;
    upi?: string | null;
    email?: string | null;
  };
  summary?: Record<string, number | undefined>;
  ipoApplications?: AppRow[];
  ledger?: Array<{
    type?: string;
    amount?: number;
    ipoName?: string | null;
    notes?: string | null;
  }>;
};

function buildPersonalHtml(statement: StatementPdfPayload) {
  const memberName = statement.member?.displayName || 'Member';
  const apps = statement.ipoApplications || [];
  const s = statement.summary || {};
  const fromApps = countAllotments(apps);
  const counts = {
    applied: s.iposApplied ?? fromApps.applied,
    allotted: s.iposAlloted ?? fromApps.allotted,
    pending: s.iposPending ?? fromApps.pending,
    notAllotted: s.iposNotAlloted ?? fromApps.notAllotted,
  };
  const ipoSummary = buildIpoProfitSummary(apps);
  const totalMemberProfit = round2(
    s.totalMemberShare != null
      ? Number(s.totalMemberShare)
      : ipoSummary.reduce((sum, r) => sum + Number(r.memberProfit || 0), 0)
  );

  const metaBits = [
    `Member: ${esc(memberName)}`,
    `PAN: ${esc(statement.member?.pan || '-')}`,
    statement.member?.upi ? `UPI: ${esc(statement.member.upi)}` : null,
    statement.member?.email ? `Email: ${esc(statement.member.email)}` : null,
  ]
    .filter(Boolean)
    .join(' &nbsp;|&nbsp; ');

  const sections: string[] = [];
  sections.push(`<div class="meta">${metaBits}</div>`);
  sections.push(`<p class="profit"><b>Total member profit (you only):</b> ${esc(money(totalMemberProfit))}</p>`);

  sections.push('<h2>1. Your allotment summary</h2>');
  sections.push(
    table(
      ['Applied', 'Allotted', 'Pending', 'Not allotted', 'Fund received', 'Fund returned', 'Pending return'],
      [[
        String(counts.applied),
        String(counts.allotted),
        String(counts.pending),
        String(counts.notAllotted),
        money(s.totalGiven),
        money(s.totalReceived),
        money(s.pendingReturn),
      ]],
      { moneyCols: [4, 5, 6] }
    )
  );

  sections.push('<h2>2. Your profit by IPO</h2>');
  sections.push(
    table(
      ['IPO', 'Apps', 'Allotted', 'Not allotted', 'Pending', 'Fund given', 'Gross P&L', 'Your profit'],
      [
        ...ipoSummary.map((row) => [
          row.ipoName,
          String(row.applications),
          String(row.allotted),
          String(row.notAllotted),
          String(row.pending),
          money(row.fundGiven),
          row.allotted ? money(row.grossPnL) : dash(),
          row.allotted ? money(row.memberProfit) : dash(),
        ]),
        [
          'TOTAL',
          String(counts.applied),
          String(counts.allotted),
          String(counts.notAllotted),
          String(counts.pending),
          money(ipoSummary.reduce((sum, r) => sum + r.fundGiven, 0)),
          money(s.grossIpoPnL ?? ipoSummary.reduce((sum, r) => sum + r.grossPnL, 0)),
          money(totalMemberProfit),
        ],
      ],
      { moneyCols: [5, 6, 7] }
    )
  );

  sections.push('<h2>3. Your application detail</h2>');
  sections.push(
    table(
      ['IPO', 'Allotment', 'Fund given', 'Fund return', 'Gross P&L', 'Your profit'],
      apps.length
        ? apps.map((app) => [
            app.ipoName || '-',
            statusLabel(app.allotmentStatus),
            money(app.amount),
            app.fundReturned ? 'Returned' : 'Pending',
            app.allotmentStatus === 'ALLOTED' ? money(app.grossProfitLoss) : dash(),
            app.allotmentStatus === 'ALLOTED' ? money(app.memberShare) : dash(),
          ])
        : [[dash(), dash(), dash(), dash(), dash(), dash()]],
      { moneyCols: [2, 4, 5] }
    )
  );

  const ledger = statement.ledger || [];
  if (ledger.length) {
    sections.push('<h2>4. Your fund transactions</h2>');
    sections.push(
      table(
        ['Type', 'Amount', 'IPO', 'Notes'],
        ledger.map((row) => [
          row.type === 'GIVEN' ? 'Fund from manager' : row.type === 'RECEIVED' ? 'Returned to manager' : String(row.type || '-'),
          money(row.amount),
          row.ipoName || '-',
          row.notes || '-',
        ]),
        { moneyCols: [1] }
      )
    );
  }

  return { html: sections.join('\n'), totalMemberProfit, counts, memberName };
}

function buildGroupHtml(group: GroupPdfPayload) {
  const groupApplications = group.groupApplications || [];
  const members = group.members || [];
  const groupStats = group.groupStats || {};
  const counts = countAllotments(groupApplications);
  const ipoSummary = buildIpoProfitSummary(groupApplications);
  const totalMemberProfit = round2(
    groupStats.totalMemberShare != null
      ? Number(groupStats.totalMemberShare)
      : ipoSummary.reduce((sum, r) => sum + Number(r.memberProfit || 0), 0)
  );

  const sections: string[] = [];
  sections.push('<div class="page-break"></div>');
  sections.push(`<h1 class="section-title">Sub-group full ledger - ${esc(group.groupName || 'Group')}</h1>`);
  sections.push(
    `<div class="meta">Sub-group: ${esc(group.groupName || '-')} &nbsp;|&nbsp; Leader: ${esc(group.leaderName || '-')} &nbsp;|&nbsp; Members: ${members.length} &nbsp;|&nbsp; Group apps: ${groupApplications.length}</div>`
  );
  sections.push(`<p class="profit"><b>Total member profit (entire sub-group):</b> ${esc(money(totalMemberProfit))}</p>`);

  sections.push('<h2>5. Group allotment summary</h2>');
  sections.push(
    table(
      ['Applied', 'Allotted', 'Pending', 'Not allotted', 'Group gross P&L', 'Group member profit'],
      [[
        String(groupStats.iposApplied ?? counts.applied),
        String(groupStats.iposAlloted ?? counts.allotted),
        String(groupStats.iposPending ?? counts.pending),
        String(groupStats.iposNotAlloted ?? counts.notAllotted),
        money(groupStats.grossIpoPnL ?? ipoSummary.reduce((sum, r) => sum + r.grossPnL, 0)),
        money(totalMemberProfit),
      ]],
      { moneyCols: [4, 5] }
    )
  );

  sections.push('<h2>6. Group profit by IPO</h2>');
  sections.push(
    table(
      ['IPO', 'Apps', 'Allotted', 'Not allotted', 'Pending', 'Fund given', 'Gross P&L', 'Member profit'],
      [
        ...(ipoSummary.length
          ? ipoSummary.map((row) => [
              row.ipoName,
              String(row.applications),
              String(row.allotted),
              String(row.notAllotted),
              String(row.pending),
              money(row.fundGiven),
              row.allotted ? money(row.grossPnL) : dash(),
              row.allotted ? money(row.memberProfit) : dash(),
            ])
          : [['No group applications', '0', '0', '0', '0', '-', '-', '-']]),
        [
          'TOTAL',
          String(counts.applied),
          String(counts.allotted),
          String(counts.notAllotted),
          String(counts.pending),
          money(ipoSummary.reduce((sum, r) => sum + r.fundGiven, 0)),
          money(groupStats.grossIpoPnL ?? ipoSummary.reduce((sum, r) => sum + r.grossPnL, 0)),
          money(totalMemberProfit),
        ],
      ],
      { moneyCols: [5, 6, 7] }
    )
  );

  if (members.length) {
    sections.push('<h2>7. Each member in the group</h2>');
    sections.push(
      table(
        ['Member', 'PAN', 'Applied', 'Allotted', 'Pending return', 'Member profit'],
        members.map((m) => [
          `${m.displayName || '-'}${m.isLeader ? ' (Leader)' : ''}`,
          m.pan || '-',
          String(m.iposApplied ?? 0),
          String(m.iposAlloted ?? 0),
          money(m.pendingReturn),
          money(m.totalMemberShare),
        ]),
        { moneyCols: [4, 5] }
      )
    );
  }

  sections.push('<h2>8. Full group application ledger</h2>');
  sections.push(
    table(
      ['Member', 'IPO', 'Allotment', 'Fund given', 'Return', 'Gross P&L', 'Member profit'],
      groupApplications.length
        ? groupApplications.map((app) => [
            app.memberName || '-',
            app.ipoName || '-',
            statusLabel(app.allotmentStatus),
            money(app.amount),
            app.fundReturned ? 'Returned' : 'Pending',
            app.allotmentStatus === 'ALLOTED' ? money(app.grossProfitLoss) : dash(),
            app.allotmentStatus === 'ALLOTED' ? money(app.memberShare) : dash(),
          ])
        : [['-', 'No applications', '-', '-', '-', '-', '-']],
      { moneyCols: [3, 5, 6] }
    )
  );

  return { html: sections.join('\n'), totalMemberProfit };
}

export function buildMemberFullLedgerHtml(
  statement: StatementPdfPayload,
  group: GroupPdfPayload | null = null
): string {
  const teamName = statement.teamName || group?.teamName || 'IPO Team';
  const generated = dayjs(statement.generatedAt || undefined).format('DD MMM YYYY, hh:mm A');
  const isLeader = Boolean(group?.isLeader);
  const title = isLeader
    ? 'Full ledger - member + sub-group report'
    : 'Full ledger - member profit and IPO report';

  const personal = buildPersonalHtml(statement);
  const groupPart = isLeader && group ? buildGroupHtml({ ...group, leaderName: group.leaderName || personal.memberName }) : null;

  let closing = `Your total member profit: ${money(personal.totalMemberProfit)}  |  ${personal.counts.allotted} allotted IPO(s)`;
  if (groupPart && group) {
    closing += `  |  Group member profit: ${money(groupPart.totalMemberProfit)}  |  ${group.groupName || 'Sub-group'}`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 14mm; size: A4 landscape; }
    body { font-family: Helvetica, Arial, sans-serif; color: #141414; font-size: 10px; margin: 0; }
    .header { background: #1e293b; color: #fff; padding: 10px 12px; margin: -14mm -14mm 12px -14mm; }
    .header .app { color: #cbd5e1; font-size: 9px; margin: 0 0 2px; }
    .header h1 { margin: 0; font-size: 16px; }
    .header .sub { color: #e2e8f0; font-size: 10px; margin-top: 2px; }
    .header .date { color: #94a3b8; font-size: 9px; float: right; margin-top: -14px; }
    h2 { font-size: 11px; margin: 14px 0 6px; color: #1e293b; }
    .section-title { font-size: 13px; margin: 0 0 8px; }
    .meta { color: #475569; margin-bottom: 6px; font-size: 9px; }
    .profit { font-size: 11px; margin: 6px 0 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
    th, td { border: 1px solid #b4b4b4; padding: 4px 5px; vertical-align: middle; word-wrap: break-word; }
    th { background: #323232; color: #fff; font-weight: bold; text-align: center; }
    td.c, th.c { text-align: center; }
    td.l { text-align: left; }
    td.bold { font-weight: bold; }
    tr:nth-child(even) td { background: #f5f5f5; }
    .page-break { page-break-before: always; height: 0; }
    .closing { margin-top: 12px; font-weight: bold; font-size: 10px; }
    .footer { margin-top: 16px; padding-top: 6px; border-top: 1px solid #c8c8c8; color: #64748b; font-size: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <p class="app">${esc(APP_NAME)}</p>
    <div class="date">${esc(generated)}</div>
    <h1>${esc(teamName)}</h1>
    <div class="sub">${esc(title)}</div>
  </div>
  ${personal.html}
  ${groupPart ? groupPart.html : ''}
  <p class="closing">${esc(closing)}</p>
  <div class="footer">${esc(APP_NAME)} | Developed by ${esc(DEVELOPER_NAME)}</div>
</body>
</html>`;
}

/** Generate PDF and open the native share sheet (Android/iOS). */
export async function shareMemberFullLedgerPdf(
  statement: StatementPdfPayload,
  group: GroupPdfPayload | null = null
) {
  const html = buildMemberFullLedgerHtml(statement, group);
  const { uri } = await Print.printToFileAsync({ html });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }

  const memberName = (statement.member?.displayName || 'Member').replace(/[^\w\-]+/g, '_');
  const suffix = group?.isLeader ? '-with-group' : '';
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share full ledger PDF',
    UTI: 'com.adobe.pdf',
  });

  return { uri, fileHint: `full-ledger-${memberName}${suffix}.pdf` };
}
