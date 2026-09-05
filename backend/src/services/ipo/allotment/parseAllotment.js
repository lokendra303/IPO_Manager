import { normalizeCompanyName } from '../identity.js';

export function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function xmlTag(xml, tag) {
  const m = String(xml || '').match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXml(m[1]).trim() : '';
}

export function xmlTables(xml, tag = 'Table') {
  const out = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi');
  let m;
  while ((m = re.exec(String(xml || '')))) out.push(m[1]);
  return out;
}

export function parseMufgCompanyList(xml) {
  return xmlTables(xml, 'Table').map((row) => ({
    companyId: xmlTag(row, 'company_id'),
    companyName: xmlTag(row, 'companyname'),
  })).filter((row) => row.companyId && row.companyName);
}

export function scoreCompanyMatch(ipoName, registrarName) {
  const a = normalizeCompanyName(ipoName);
  const b = normalizeCompanyName(registrarName);
  if (!a || !b) return 0;
  if (a === b) return 4;
  if (a.includes(b) || b.includes(a)) return 3;
  const aw = new Set(a.split(' ').filter((w) => w.length > 2));
  const hits = b.split(' ').filter((w) => w.length > 2 && aw.has(w)).length;
  if (hits >= 2) return 2;
  if (hits === 1 && a.split(' ')[0] === b.split(' ')[0]) return 1;
  return 0;
}

export function matchRegistrarCompany(ipoNames, companies) {
  let best = null;
  let bestScore = 0;
  for (const company of companies || []) {
    for (const name of ipoNames) {
      const score = scoreCompanyMatch(name, company.companyName);
      if (score > bestScore) {
        bestScore = score;
        best = company;
      }
    }
  }
  return bestScore >= 2 ? best : null;
}

export function toInt(value) {
  const n = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function mapShareAllotment(allottedShares, appliedShares) {
  const allotted = toInt(allottedShares) || 0;
  const applied = toInt(appliedShares);
  if (allotted <= 0) {
    return { status: 'NOT_ALLOTED', allottedShares: 0, appliedShares: applied };
  }
  if (applied != null && applied > 0 && allotted < applied) {
    return { status: 'PARTIALLY_ALLOTTED', allottedShares: allotted, appliedShares: applied };
  }
  return { status: 'ALLOTED', allottedShares: allotted, appliedShares: applied };
}

export function sharesToLots(shares, lotSize) {
  const qty = toInt(shares) || 0;
  const lot = toInt(lotSize);
  if (qty <= 0) return 0;
  if (!lot || lot <= 0) return 1;
  const lots = Math.round(qty / lot);
  return lots > 0 ? lots : 1;
}

export function parseMufgSearchXml(xml) {
  const message = xmlTables(xml, 'Table1').map((row) => xmlTag(row, 'Msg')).find(Boolean);
  if (message) {
    return { kind: 'message', message };
  }
  const tables = xmlTables(xml, 'Table');
  if (!tables.length) {
    return { kind: 'empty' };
  }
  const rows = tables.map((row) => ({
    name: xmlTag(row, 'NAME1'),
    applicationNumber: xmlTag(row, 'PEMNDG') || xmlTag(row, 'APPNO') || xmlTag(row, 'APPLICATION_NO'),
    appliedShares: toInt(xmlTag(row, 'SHARES')),
    allottedShares: toInt(xmlTag(row, 'ALLOT')),
    amountAdjusted: toInt(xmlTag(row, 'AMTADJ')),
    refundAmount: toInt(xmlTag(row, 'RFNDAMT')),
  }));
  const totalAllotted = rows.reduce((s, r) => s + (r.allottedShares || 0), 0);
  const totalApplied = rows.reduce((s, r) => s + (r.appliedShares || 0), 0);
  return {
    kind: 'result',
    ...mapShareAllotment(totalAllotted, totalApplied),
    applicationNumber: rows[0]?.applicationNumber || null,
    rows,
  };
}

function skipSelectLabel(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  if (!s) return true;
  if (/^-+/.test(s)) return true;
  if (/select company|choose a company|select ipo|--select--/i.test(s)) return true;
  return false;
}

export function parseHtmlSelectCompanies(html) {
  const out = [];
  const re = /<option\b([^>]*)>([^<]*)<\/option>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const attrs = m[1] || '';
    const name = decodeXml(m[2]).replace(/\s+/g, ' ').trim();
    if (skipSelectLabel(name)) continue;
    const value = (attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [])[1];
    const companyId = String(value || name).trim();
    if (!companyId || companyId === '0' || skipSelectLabel(companyId)) continue;
    out.push({ companyId, companyName: name });
  }
  return out;
}

export function parseKfinCompanyScript(js) {
  const m = String(js || '').match(/JSON\.parse\('(\[\{"clientId":[\s\S]*?\])'\)/);
  if (!m) return [];
  try {
    const rows = JSON.parse(m[1].replace(/\\'/g, "'"));
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        companyId: String(row?.clientId || '').trim(),
        companyName: String(row?.name || '').trim(),
      }))
      .filter((row) => row.companyId && row.companyName);
  } catch {
    return [];
  }
}

export function parseKfinSearchJson(json) {
  const list = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.data?.data)
      ? json.data.data
      : [];
  if (!list.length) return { kind: 'empty' };
  const rows = list.map((row) => ({
    name: row?.Name || row?.name || '',
    applicationNumber: row?.Appln_No || row?.applicationNumber || null,
    appliedShares: toInt(row?.App_Shares ?? row?.appliedShares),
    allottedShares: toInt(row?.All_Shares ?? row?.allottedShares),
  }));
  const totalAllotted = rows.reduce((s, r) => s + (r.allottedShares || 0), 0);
  const totalApplied = rows.reduce((s, r) => s + (r.appliedShares || 0), 0);
  return {
    kind: 'result',
    ...mapShareAllotment(totalAllotted, totalApplied),
    applicationNumber: rows[0]?.applicationNumber || null,
    rows,
  };
}

export function parseSkylineResultHtml(html) {
  const text = String(html || '');
  if (/session has expired/i.test(text)) {
    return { kind: 'message', message: 'Skyline asked to retry the search' };
  }
  if (/no record found/i.test(text)) {
    return { kind: 'empty' };
  }
  const allotted = toInt((text.match(/allot\w*[^0-9]{0,80}([\d,]+)/i) || [])[1]);
  const applied = toInt((text.match(/appl(?:ied|ication)[^0-9]{0,80}([\d,]+)/i) || [])[1]);
  if (allotted == null && applied == null) {
    return { kind: 'message', message: 'Skyline returned an unreadable allotment page' };
  }
  return {
    kind: 'result',
    ...mapShareAllotment(allotted || 0, applied),
    applicationNumber: null,
  };
}
