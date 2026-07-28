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

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function table(headers: string[], rows: string[][]) {
  const th = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows
    .map((row) => {
      const isTotal = String(row[0] || '').toUpperCase().startsWith('TOTAL');
      const tds = row
        .map((cell) => `<td class="${isTotal ? 'bold' : ''}">${esc(cell)}</td>`)
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

function section(title: string, html: string) {
  return `<h2>${esc(title)}</h2>${html}`;
}

export type ProfitAnalysisPayload = {
  overall?: Record<string, unknown>;
  revenue?: Record<string, unknown>;
  manager?: Record<string, unknown>;
  reportScope?: Record<string, unknown>;
  members?: any[];
  providers?: any[];
  subGroups?: any[];
  bySegment?: any[];
  byCategory?: any[];
  ungroupedMembers?: any[];
};

export function buildProfitAnalysisHtml(
  analysis: ProfitAnalysisPayload,
  meta: { teamName?: string; generatedAt?: string } = {}
) {
  const teamName = meta.teamName || 'IPO Team';
  const generated = dayjs(meta.generatedAt || undefined).format('DD MMM YYYY, hh:mm A');
  const overall = analysis.overall || {};
  const revenue = analysis.revenue || {};
  const manager = analysis.manager || {};
  const reportScope = analysis.reportScope || {};
  const members = analysis.members || [];
  const providers = analysis.providers || [];
  const subGroups = analysis.subGroups || [];
  const bySegment = analysis.bySegment || [];
  const byCategory = analysis.byCategory || [];
  const ungrouped = analysis.ungroupedMembers || [];
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
    (reportScope.filters as { label?: string } | undefined)?.label
    || (reportScope.periodLabel as string | undefined)
    || 'All time';

  const coverageTable = table(
    ['IPOs applied', 'IPOs gave profit', 'Active apps', 'Apps gave profit'],
    [[String(iposApplied), String(iposProfit), String(applicationCount), String(profitApps)]]
  );

  const revenueTable = table(
    ['Party', 'Share / revenue', 'Notes'],
    [
      ['Members (kept)', money(revenue.memberShare), 'Sum of member shares from P&L splits'],
      [
        'Manager (you)',
        money(revenue.managerShare),
        `${money(manager.profitShare)} from profit · ${money(manager.lossShare)} from loss`,
      ],
      ['Fund providers', money(revenue.providerShare), 'Provider share via share rules'],
      ['TOTAL distributed', money(revenue.grossDistributed), 'Member + manager + provider'],
    ]
  );

  const segmentTable = table(
    ['Segment', 'Gross split', 'Member', 'Manager', 'Provider', 'Splits'],
    bySegment.length
      ? bySegment.map((r) => [
          r.label || r.ipoSegment,
          money(r.grossDistributed),
          money(r.memberShare),
          money(r.managerShare),
          money(r.providerShare),
          String(r.distributionCount ?? 0),
        ])
      : [['-', '-', '-', '-', '-', '-']]
  );

  const categoryTable = table(
    ['Category', 'Gross split', 'Member', 'Manager', 'Provider', 'Splits'],
    byCategory.length
      ? byCategory.map((r) => [
          r.label || r.investorCategory,
          money(r.grossDistributed),
          money(r.memberShare),
          money(r.managerShare),
          money(r.providerShare),
          String(r.distributionCount ?? 0),
        ])
      : [['-', '-', '-', '-', '-', '-']]
  );

  const memberTable = table(
    ['Member', 'PAN', 'Sub-group', 'Gross P&L', 'Member keeps', 'Manager', 'Provider', 'Pending'],
    members.length
      ? members.map((r) => [
          `${r.displayName || '-'}${r.isGroupLeader ? ' (Leader)' : ''}`,
          r.pan || '-',
          r.memberGroupName || '-',
          money(r.grossIpoPnL),
          money(r.memberShare),
          money(r.managerShare),
          money(r.providerShare),
          Number(r.pendingGross) ? money(r.pendingGross) : '-',
        ])
      : [['-', 'No allotted IPO P&L yet', '-', '-', '-', '-', '-', '-']]
  );

  const providerTable = table(
    ['Provider', 'Total share', 'From profit', 'From loss', 'Splits'],
    providers.length
      ? providers.map((r) => [
          r.providerName || '-',
          money(r.totalShare),
          money(r.profitShare),
          money(r.lossShare),
          String(r.distributionCount ?? 0),
        ])
      : [['-', 'No provider shares yet', '-', '-', '-']]
  );

  const managerTable = table(
    ['Item', 'Amount'],
    [
      ['Total manager share', money(manager.totalShare)],
      ['From profit splits', money(manager.profitShare)],
      ['From loss splits', money(manager.lossShare)],
    ]
  );

  const groupParts = subGroups.length
    ? subGroups
        .map((g) => {
          const rows = [
            ...(g.members || []).map((m: any) => [
              m.displayName || '-',
              m.isLeader ? 'Leader' : 'Member',
              money(m.grossIpoPnL),
              money(m.memberShare),
              money(m.managerShare),
              money(m.providerShare),
            ]),
            [
              `TOTAL vs ${g.leaderDisplayName || 'leader'}`,
              '',
              money(g.totals?.grossIpoPnL),
              money(g.totals?.memberShare),
              money(g.totals?.managerShare),
              money(g.totals?.providerShare),
            ],
          ];
          return `
            <h3>${esc(g.groupName || 'Group')} — Leader: ${esc(g.leaderDisplayName || '-')} (${g.memberCount || 0} members)</h3>
            ${table(['Member', 'Role', 'Gross P&L', 'Member profit', 'Manager', 'Provider'], rows)}
          `;
        })
        .join('')
    : '<p class="muted">No sub-groups with members.</p>';

  const ungroupedTable = ungrouped.length
    ? section(
        '8. Members not in a sub-group',
        table(
          ['Member', 'PAN', 'Gross P&L', 'Member keeps', 'Manager', 'Provider'],
          ungrouped.map((r) => [
            r.displayName || '-',
            r.pan || '-',
            money(r.grossIpoPnL),
            money(r.memberShare),
            money(r.managerShare),
            money(r.providerShare),
          ])
        )
      )
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Helvetica, Arial, sans-serif; color: #1e293b; font-size: 10px; margin: 14px; }
    .header { background: #1e293b; color: #fff; padding: 10px 12px; margin: -14px -14px 10px; }
    .app { color: #cbd5e1; font-size: 9px; }
    .team { font-size: 14px; font-weight: 700; margin-top: 2px; }
    .title { color: #e2e8f0; font-size: 10px; margin-top: 2px; }
    .meta { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 8px; }
    .meta div { min-width: 120px; }
    .meta .lbl { color: #64748b; font-size: 9px; }
    .meta .val { font-weight: 700; font-size: 11px; margin-top: 1px; }
    h2 { font-size: 11px; margin: 4px 0 2px; color: #0f172a; padding-top: 10px; border-top: 2.5px solid #1e293b; }
    h3 { font-size: 10px; margin: 3px 0 2px; color: #334155; padding-top: 9px; border-top: 2px solid #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 0; margin-bottom: 4px; }
    th, td { border: 1px solid #b4b4b4; padding: 4px 5px; text-align: center; font-size: 9px; }
    th { background: #323232; color: #fff; }
    tr:nth-child(even) td { background: #f5f5f5; }
    td.bold { font-weight: 700; }
    .closing { font-weight: 700; font-size: 11px; margin-top: 4px; padding-top: 10px; border-top: 2.5px solid #1e293b; }
    .note { color: #64748b; font-size: 9px; margin-top: 4px; }
    .muted { color: #64748b; }
    .footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="app">${esc(APP_NAME)}</div>
    <div class="team">${esc(teamName)}</div>
    <div class="title">Profit analysis report · ${esc(periodLabel)} · ${esc(generated)}</div>
    <div class="title">${esc(iposAppliedLabel)} · ${esc(iposProfitLabel)} · ${esc(appsLabel)}</div>
  </div>

  ${section(`Coverage (${periodLabel})`, coverageTable)}

  <div class="meta">
    <div><div class="lbl">Apps gave loss</div><div class="val">${esc(String(lossApps))}</div></div>
    <div><div class="lbl">Break-even</div><div class="val">${esc(String(flatApps))}</div></div>
    <div><div class="lbl">Gross IPO P&amp;L</div><div class="val">${esc(money(overall.grossIpoPnL))}</div></div>
    <div><div class="lbl">Member revenue</div><div class="val">${esc(money(revenue.memberShare))}</div></div>
    <div><div class="lbl">Manager revenue</div><div class="val">${esc(money(revenue.managerShare))}</div></div>
    <div><div class="lbl">Provider revenue</div><div class="val">${esc(money(revenue.providerShare))}</div></div>
    <div><div class="lbl">Pending to split</div><div class="val">${esc(money(revenue.pendingGross))}</div></div>
  </div>

  ${section('1. Revenue overview (who keeps the profit)', revenueTable)}
  ${section('2. By IPO segment', segmentTable)}
  ${section('3. By investor category (RII / HNI)', categoryTable)}
  ${section('4. Member-wise profit detail', memberTable)}
  ${section('5. Fund provider share detail', providerTable)}
  ${section('6. Manager (your) share', managerTable)}
  ${section('7. Sub-group leader rollups', groupParts)}
  ${ungroupedTable}

  <p class="closing">
    Summary (${esc(iposAppliedLabel)}, ${esc(iposProfitLabel)}, ${esc(appsLabel)}: ${esc(String(profitApps))} apps profit / ${esc(String(lossApps))} loss):
    Member ${esc(money(revenue.memberShare))}
    | Manager ${esc(money(revenue.managerShare))}
    | Provider ${esc(money(revenue.providerShare))}
    | Gross IPO P&amp;L ${esc(money(overall.grossIpoPnL))}
  </p>
  <p class="note">
    Note: Profit stays on each application member. Sub-group totals sum members under that leader (not transferred to the leader).
  </p>
  <div class="footer">${esc(APP_NAME)} | Developed by ${esc(DEVELOPER_NAME)}</div>
</body>
</html>`;
}

/** Generate PDF and open the native share sheet (Android/iOS). */
export async function shareProfitAnalysisPdf(
  analysis: ProfitAnalysisPayload,
  meta: { teamName?: string; generatedAt?: string } = {}
) {
  const html = buildProfitAnalysisHtml(analysis, meta);
  const { uri } = await Print.printToFileAsync({ html });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share profit analysis PDF',
    UTI: 'com.adobe.pdf',
  });

  const safeTeam = String(meta.teamName || 'IPO-Team').replace(/[^\w\-]+/g, '_');
  return { uri, fileHint: `profit-analysis-${safeTeam}.pdf` };
}

/** Generate PDF and open a preview (print/preview UI or in-app browser). */
export async function previewProfitAnalysisPdf(
  analysis: ProfitAnalysisPayload,
  meta: { teamName?: string; generatedAt?: string } = {}
) {
  const html = buildProfitAnalysisHtml(analysis, meta);
  // Opens system print/preview UI — best PDF preview on device without a PDF viewer package
  await Print.printAsync({ html });
  return true;
}
