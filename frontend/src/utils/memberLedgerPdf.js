import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';

const APP_NAME = 'IPO Team Manager';
const DEVELOPER_NAME = 'Lokendra';
const MARGIN = 14;
const HEADER_H = 26;
const FOOTER_H = 12;

/** Plain ASCII amount — no locale spaces/commas that look gappy in PDF. */
function money(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const rounded = Math.round(n * 100) / 100;
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  // Keep digits tight: Rs.14960 or Rs.456.90 (no thousand separators)
  if (Number.isInteger(abs)) return `${sign}Rs.${abs}`;
  return `${sign}Rs.${abs.toFixed(2)}`;
}

function dash() {
  return '-';
}

function statusLabel(status) {
  const s = String(status || '').replace(/_/g, ' ').trim();
  if (!s) return '-';
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
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
  doc.setFontSize(8);
  doc.text(APP_NAME, MARGIN, 9);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(String(teamName || 'IPO Team'), MARGIN, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text(String(title || ''), MARGIN, 23);

  if (subtitle) {
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(String(subtitle), w - MARGIN, 23, { align: 'right' });
  }
}

function drawReportFooter(doc) {
  const pageCount = doc.getNumberOfPages();
  const w = pageWidth(doc);
  const h = pageHeight(doc);

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, h - FOOTER_H, w - MARGIN, h - FOOTER_H);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`${APP_NAME} | Developed by ${DEVELOPER_NAME}`, MARGIN, h - 5);
    doc.text(`Page ${i} of ${pageCount}`, w - MARGIN, h - 5, { align: 'right' });
  }
}

function ensureSpace(doc, needed = 24) {
  const h = pageHeight(doc);
  const y = doc.lastAutoTable?.finalY ?? HEADER_H + 10;
  if (y + needed > h - FOOTER_H - 6) {
    doc.addPage();
    return MARGIN;
  }
  return y + 7;
}

function sectionTitle(doc, text, y) {
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(String(text), MARGIN, y);
  return y + 4;
}

function metaLine(doc, y, pairs) {
  const colW = contentWidth(doc) / Math.min(pairs.length, 4);
  pairs.forEach((pair, i) => {
    const x = MARGIN + colW * i;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`${pair.label}:`, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(String(pair.value), x, y + 4);
  });
  return y + 10;
}

function profitLine(doc, y, label, value) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(`${label}:  ${value}`, MARGIN, y);
  return y + 6;
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
      w = Math.round((tableW * (col.weight / totalWeight)) * 100) / 100;
      used += w;
    }
    styles[i] = {
      cellWidth: w,
      halign: col.align,
      valign: 'middle',
    };
  });
  return styles;
}

/**
 * Simple plain table — left text, center for counts/status/money.
 * Alignment forced on every cell (head + body) so values match headers.
 */
function drawTable(doc, _meta, { startY, head, body, columns, fontSize = 8 }) {
  const tableW = contentWidth(doc);
  const aligns = columns.map((c) => c.align);
  const columnStyles = columnStylesFrom(tableW, columns);

  autoTable(doc, {
    startY,
    head,
    body,
    tableWidth: tableW,
    // Small top margin so continuation pages do not reserve header space
    margin: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: FOOTER_H + 4 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontStyle: 'normal',
      fontSize,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      valign: 'middle',
      overflow: 'linebreak',
      lineColor: [180, 180, 180],
      lineWidth: 0.2,
      textColor: [20, 20, 20],
      minCellHeight: 7,
    },
    headStyles: {
      fillColor: [50, 50, 50],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize,
      valign: 'middle',
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles,
    didParseCell: (data) => {
      const align = aligns[data.column.index];
      if (align) data.cell.styles.halign = align;
      if (
        data.section === 'body'
        && data.row.index === data.table.body.length - 1
        && String(data.row.raw?.[0] || '').toUpperCase() === 'TOTAL'
      ) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
}

const L = (w) => ({ align: 'left', weight: w });
const C = (w) => ({ align: 'center', weight: w });
/** Amounts are centered so Rs. text looks even in the cell. */
const M = (w) => ({ align: 'center', weight: w });

function buildIpoProfitSummary(apps) {
  const map = new Map();
  for (const app of apps) {
    const key = app.ipoName || 'Unknown IPO';
    const row = map.get(key) ?? {
      ipoName: key,
      openDate: app.openDate || app.open_date || null,
      ipoId: app.ipoId || app.ipo_id || 0,
      applications: 0,
      allotted: 0,
      notAllotted: 0,
      pending: 0,
      fundGiven: 0,
      grossPnL: 0,
      memberProfit: 0,
    };
    if (!row.openDate && (app.openDate || app.open_date)) {
      row.openDate = app.openDate || app.open_date;
    }
    if (!row.ipoId && (app.ipoId || app.ipo_id)) {
      row.ipoId = app.ipoId || app.ipo_id;
    }
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
  return [...map.values()].sort((a, b) => {
    const dateMs = (row) => {
      if (!row.openDate) return 0;
      const t = new Date(row.openDate).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const diff = dateMs(b) - dateMs(a);
    if (diff !== 0) return diff;
    return Number(b.ipoId || 0) - Number(a.ipoId || 0);
  });
}

function countAllotments(apps) {
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

function addPersonalSections(doc, statement, meta) {
  const memberName = statement.member?.displayName || 'Member';
  const apps = [...(statement.ipoApplications || [])].sort((a, b) => {
    const dateMs = (row) => {
      const raw = row.openDate || row.open_date || null;
      if (!raw) return 0;
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const diff = dateMs(b) - dateMs(a);
    if (diff !== 0) return diff;
    return Number(b.ipoId || 0) - Number(a.ipoId || 0);
  });
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

  let y = HEADER_H + 8;
  y = metaLine(doc, y, [
    { label: 'Member', value: memberName },
    { label: 'PAN', value: statement.member?.pan || '-' },
    ...(statement.member?.upi ? [{ label: 'UPI', value: statement.member.upi }] : []),
    ...(statement.member?.email ? [{ label: 'Email', value: statement.member.email }] : []),
  ]);

  y = profitLine(doc, y, 'Total member profit (you only)', money(totalMemberProfit));

  y = sectionTitle(doc, '1. Your allotment summary', y + 2);
  drawTable(doc, meta, {
    startY: y,
    head: [['Applied', 'Allotted', 'Pending', 'Not allotted', 'Fund received', 'Fund returned', 'Pending return']],
    body: [[
      String(counts.applied),
      String(counts.allotted),
      String(counts.pending),
      String(counts.notAllotted),
      money(s.totalGiven),
      money(s.totalReceived),
      money(s.pendingReturn),
    ]],
    columns: [C(1), C(1), C(1), C(1.2), M(1.6), M(1.6), M(1.6)],
  });

  y = sectionTitle(doc, '2. Your profit by IPO', ensureSpace(doc, 36));
  drawTable(doc, meta, {
    startY: y,
    head: [['IPO', 'Apps', 'Allotted', 'Not allotted', 'Pending', 'Fund given', 'Gross P&L', 'Your profit']],
    body: [
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
    columns: [L(2.6), C(0.7), C(0.9), C(1.1), C(0.8), M(1.4), M(1.4), M(1.4)],
  });

  y = sectionTitle(doc, '3. Your application detail', ensureSpace(doc, 36));
  drawTable(doc, meta, {
    startY: y,
    head: [['IPO', 'Allotment', 'Fund given', 'Fund return', 'Gross P&L', 'Your profit']],
    body: apps.length
      ? apps.map((app) => [
          app.ipoName || '-',
          statusLabel(app.allotmentStatus),
          money(app.amount),
          app.fundReturned ? 'Returned' : 'Pending',
          app.allotmentStatus === 'ALLOTED' ? money(app.grossProfitLoss) : dash(),
          app.allotmentStatus === 'ALLOTED' ? money(app.memberShare) : dash(),
        ])
      : [[dash(), dash(), dash(), dash(), dash(), dash()]],
    columns: [L(2.8), C(1.3), M(1.5), C(1.2), M(1.5), M(1.5)],
  });

  const ledger = statement.ledger || [];
  if (ledger.length) {
    y = sectionTitle(doc, '4. Your fund transactions', ensureSpace(doc, 32));
    drawTable(doc, meta, {
      startY: y,
      head: [['Type', 'Amount', 'IPO', 'Notes']],
      body: ledger.map((row) => [
        row.type === 'GIVEN' ? 'Fund from manager' : row.type === 'RECEIVED' ? 'Returned to manager' : row.type,
        money(row.amount),
        row.ipoName || '-',
        row.notes || '-',
      ]),
      columns: [L(2), M(1.3), L(2), L(2.5)],
    });
  }

  return { totalMemberProfit, counts, memberName };
}

function addGroupSections(doc, group, meta) {
  const {
    groupName,
    leaderName,
    groupStats = {},
    members = [],
  } = group;
  const groupApplications = [...(group.groupApplications || [])].sort((a, b) => {
    const dateMs = (row) => {
      const raw = row.openDate || row.open_date || null;
      if (!raw) return 0;
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const diff = dateMs(b) - dateMs(a);
    if (diff !== 0) return diff;
    return Number(b.ipoId || 0) - Number(a.ipoId || 0);
  });

  const counts = countAllotments(groupApplications);
  const ipoSummary = buildIpoProfitSummary(groupApplications);
  const totalMemberProfit = round2(
    groupStats.totalMemberShare != null
      ? Number(groupStats.totalMemberShare)
      : ipoSummary.reduce((sum, r) => sum + Number(r.memberProfit || 0), 0)
  );

  const groupMeta = {
    ...meta,
    title: `Sub-group full ledger - ${groupName || 'Group'}`,
  };

  doc.addPage();

  let y = MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(`Sub-group full ledger - ${groupName || 'Group'}`, MARGIN, y);
  y += 8;

  y = metaLine(doc, y, [
    { label: 'Sub-group', value: groupName || '-' },
    { label: 'Leader', value: leaderName || '-' },
    { label: 'Members', value: String(members.length) },
    { label: 'Group apps', value: String(groupApplications.length) },
  ]);

  y = profitLine(doc, y, 'Total member profit (entire sub-group)', money(totalMemberProfit));

  y = sectionTitle(doc, '5. Group allotment summary', y + 2);
  drawTable(doc, groupMeta, {
    startY: y,
    head: [['Applied', 'Allotted', 'Pending', 'Not allotted', 'Group gross P&L', 'Group member profit']],
    body: [[
      String(groupStats.iposApplied ?? counts.applied),
      String(groupStats.iposAlloted ?? counts.allotted),
      String(groupStats.iposPending ?? counts.pending),
      String(groupStats.iposNotAlloted ?? counts.notAllotted),
      money(groupStats.grossIpoPnL ?? ipoSummary.reduce((sum, r) => sum + r.grossPnL, 0)),
      money(totalMemberProfit),
    ]],
    columns: [C(1), C(1), C(1), C(1.2), M(1.8), M(1.8)],
  });

  y = sectionTitle(doc, '6. Group profit by IPO', ensureSpace(doc, 36));
  drawTable(doc, groupMeta, {
    startY: y,
    head: [['IPO', 'Apps', 'Allotted', 'Not allotted', 'Pending', 'Fund given', 'Gross P&L', 'Member profit']],
    body: [
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
    columns: [L(2.6), C(0.7), C(0.9), C(1.1), C(0.8), M(1.4), M(1.4), M(1.4)],
  });

  if (members.length) {
    y = sectionTitle(doc, '7. Each member in the group', ensureSpace(doc, 36));
    drawTable(doc, groupMeta, {
      startY: y,
      head: [['Member', 'PAN', 'Applied', 'Allotted', 'Pending return', 'Member profit']],
      body: members.map((m) => [
        `${m.displayName || '-'}${m.isLeader ? ' (Leader)' : ''}`,
        m.pan || '-',
        String(m.iposApplied ?? 0),
        String(m.iposAlloted ?? 0),
        money(m.pendingReturn),
        money(m.totalMemberShare),
      ]),
      columns: [L(2.4), L(1.5), C(0.9), C(0.9), M(1.5), M(1.5)],
    });
  }

  y = sectionTitle(doc, '8. Full group application ledger', ensureSpace(doc, 36));
  drawTable(doc, groupMeta, {
    startY: y,
    fontSize: 7.5,
    head: [['Member', 'IPO', 'Allotment', 'Fund given', 'Return', 'Gross P&L', 'Member profit']],
    body: groupApplications.length
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
    columns: [L(1.5), L(2.3), C(1.2), M(1.4), C(1), M(1.4), M(1.4)],
  });

  return { totalMemberProfit };
}

export function downloadMemberFullLedgerPdf(statement, group = null) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const teamName = statement.teamName || group?.teamName || 'IPO Team';
  const memberName = statement.member?.displayName || 'Member';
  const generated = dayjs(statement.generatedAt || undefined).format('DD MMM YYYY, hh:mm A');
  const isLeader = Boolean(group?.isLeader);

  const meta = {
    doc,
    teamName,
    title: isLeader
      ? 'Full ledger - member + sub-group report'
      : 'Full ledger - member profit and IPO report',
    subtitle: generated,
  };

  drawReportHeader(doc, meta);
  const personal = addPersonalSections(doc, statement, meta);

  let groupProfit = null;
  if (isLeader) {
    groupProfit = addGroupSections(
      doc,
      {
        ...group,
        teamName,
        leaderName: group.leaderName || memberName,
      },
      meta
    );
  }

  const endY = ensureSpace(doc, 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  let closing = `Your total member profit: ${money(personal.totalMemberProfit)}  |  ${personal.counts.allotted} allotted IPO(s)`;
  if (isLeader) {
    closing += `  |  Group member profit: ${money(groupProfit?.totalMemberProfit)}  |  ${group.groupName || 'Sub-group'}`;
  }
  doc.text(closing, MARGIN, endY);

  drawReportFooter(doc);

  const safeName = memberName.replace(/[^\w\-]+/g, '_');
  const suffix = isLeader ? '-with-group' : '';
  doc.save(`full-ledger-${safeName}${suffix}-${dayjs().format('YYYY-MM-DD')}.pdf`);
}

export function downloadGroupFullLedgerPdf(group) {
  const statement = {
    teamName: group.teamName,
    generatedAt: new Date().toISOString(),
    member: {
      displayName: group.leaderName || 'Leader',
      pan: '-',
    },
    summary: {
      totalGiven: 0,
      totalReceived: 0,
      pendingReturn: 0,
      grossIpoPnL: group.groupStats?.grossIpoPnL ?? 0,
      totalMemberShare: group.groupStats?.totalMemberShare ?? 0,
      iposApplied: group.groupStats?.iposApplied ?? 0,
      iposAlloted: group.groupStats?.iposAlloted ?? 0,
      iposPending: group.groupStats?.iposPending ?? 0,
      iposNotAlloted: group.groupStats?.iposNotAlloted ?? 0,
    },
    ipoApplications: [],
    ledger: [],
  };
  downloadMemberFullLedgerPdf(statement, { ...group, isLeader: true });
}
