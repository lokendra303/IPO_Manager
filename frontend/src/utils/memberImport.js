export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9]{2,64}$/;

export const MEMBER_IMPORT_COLUMNS = [
  { key: 'pan', header: 'pan (required)', required: true, note: '10 characters like ABCDE1234F' },
  { key: 'name', header: 'name (required)', required: true, note: 'Member display name' },
  { key: 'email', header: 'email (optional)', required: false, note: 'Can be empty' },
  { key: 'upi', header: 'upi (optional)', required: false, note: 'e.g. name@paytm — can be empty' },
  { key: 'status', header: 'status (optional)', required: false, note: 'ACTIVE or INACTIVE — empty means ACTIVE' },
  { key: 'relationship_note', header: 'relationship_note (optional)', required: false, note: 'Can be empty' },
  { key: 'sub_group', header: 'sub_group (optional)', required: false, note: 'Must match an existing sub-group name, or leave empty' },
  { key: 'sort_order', header: 'sort_order (optional)', required: false, note: 'Whole number, or leave empty' },
];

export const MEMBER_IMPORT_HEADERS = MEMBER_IMPORT_COLUMNS.map((c) => c.header);

export const MEMBER_IMPORT_SAMPLE_ROWS = [
  {
    pan: 'ABCDE1234F',
    name: 'Rahul Sharma',
    email: 'rahul@example.com',
    upi: 'rahul@paytm',
    status: 'ACTIVE',
    relationship_note: 'BROTHER',
    sub_group: '',
    sort_order: '0',
  },
  {
    pan: 'FGHIJ5678K',
    name: 'Priya',
    email: '',
    upi: '',
    status: '',
    relationship_note: '',
    sub_group: '',
    sort_order: '',
  },
];

const HEADER_ALIASES = {
  pan: ['pan', 'pan_number', 'pan_no', 'pannumber', 'pan_(required)', 'pan*'],
  name: ['name', 'display_name', 'displayname', 'member_name', 'member', 'name_(required)', 'name_(optional)'],
  email: ['email', 'mail', 'email_id', 'email_(optional)'],
  upi: ['upi', 'upi_id', 'upiid', 'upi_(optional)'],
  status: ['status', 'status_(optional)'],
  relationship_note: ['relationship_note', 'relationship', 'note', 'relation', 'relationship_note_(optional)'],
  sub_group: ['sub_group', 'subgroup', 'group', 'member_group', 'group_name', 'sub_group_(optional)'],
  sort_order: ['sort_order', 'sortorder', 'sort', 'order', 'sort_order_(optional)'],
};

function normHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function cell(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function normalizePanValue(value) {
  return cell(value).toUpperCase().replace(/[\s-]/g, '');
}

function headerMap(headers) {
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.includes(normHeader(h)));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

export function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v || '').trim()));
}

function objectsFromGrid(grid) {
  if (!grid.length) return { error: 'File is empty', rows: [] };
  const headers = grid[0].map((h) => cell(h));
  const map = headerMap(headers);
  if (map.pan == null) {
    return { error: 'Missing required column: pan', rows: [] };
  }
  if (map.name == null) {
    return { error: 'Missing required column: name', rows: [] };
  }
  const rows = grid.slice(1).map((cells, index) => {
    const get = (field) => (map[field] == null ? '' : cell(cells[map[field]]));
    return {
      rowNumber: index + 2,
      pan: get('pan'),
      name: get('name'),
      email: get('email'),
      upi: get('upi'),
      status: get('status'),
      relationship_note: get('relationship_note'),
      sub_group: get('sub_group'),
      sort_order: get('sort_order'),
    };
  });
  return { error: null, rows };
}

export function parseMemberCsv(text) {
  return objectsFromGrid(parseCsv(text));
}

async function loadXlsx() {
  const mod = await import('xlsx');
  return mod.default || mod;
}

export async function parseMemberSpreadsheet(file) {
  const name = String(file?.name || '').toLowerCase();
  const isExcel = /\.(xlsx|xls|xlsm)$/.test(name) || /excel|spreadsheet/.test(file?.type || '');
  if (isExcel) {
    const XLSX = await loadXlsx();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { error: 'Excel file has no sheet', rows: [] };
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    return objectsFromGrid(grid);
  }
  const text = await file.text();
  return parseMemberCsv(text);
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function membersToCsv(rows) {
  const lines = [
    MEMBER_IMPORT_COLUMNS.map((c) => csvEscape(c.header)).join(','),
    ...rows.map((r) => MEMBER_IMPORT_COLUMNS.map((c) => csvEscape(r[c.key])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

function downloadBlob(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function downloadMemberCsv(rows, filename) {
  downloadBlob(membersToCsv(rows), filename, 'text/csv;charset=utf-8');
}

export async function downloadMemberXlsx(rows, filename) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const aoa = [
    MEMBER_IMPORT_COLUMNS.map((c) => c.header),
    ...rows.map((r) => MEMBER_IMPORT_COLUMNS.map((c) => r[c.key] ?? '')),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = MEMBER_IMPORT_COLUMNS.map((c) => ({ wch: Math.max(16, c.header.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Members');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

export function downloadMemberSample(format) {
  if (format === 'xlsx') return downloadMemberXlsx(MEMBER_IMPORT_SAMPLE_ROWS, 'members-sample.xlsx');
  downloadMemberCsv(MEMBER_IMPORT_SAMPLE_ROWS, 'members-sample.csv');
}

export function membersToExportRows(members) {
  return (members || []).map((m) => ({
    pan: m.pan || '',
    name: m.display_name || '',
    email: m.email || '',
    upi: m.upi || '',
    status: m.status || 'ACTIVE',
    relationship_note: m.relationship_note || '',
    sub_group: m.member_group_name || '',
    sort_order: m.sort_order ?? '',
  }));
}

export function validateMemberImportRows(rawRows, { existingPans = [], groupNames = [] } = {}) {
  const existing = new Set((existingPans || []).map((p) => normalizePanValue(p)).filter(Boolean));
  const groups = new Map((groupNames || []).map((n) => [String(n).trim().toLowerCase(), n]));
  const seen = new Map();
  return (rawRows || []).map((raw) => {
    const errors = [];
    const warnings = [];
    const pan = normalizePanValue(raw.pan);
    if (!pan) errors.push('PAN is required');
    else if (pan.length !== 10) errors.push('PAN must be 10 characters');
    else if (!PAN_REGEX.test(pan)) errors.push('PAN format must be ABCDE1234F (5 letters, 4 digits, 1 letter)');
    else if (existing.has(pan)) errors.push('Already on the team');
    else if (seen.has(pan)) errors.push(`Duplicate PAN in file (row ${seen.get(pan)})`);
    if (pan && !seen.has(pan)) seen.set(pan, raw.rowNumber);

    const name = cell(raw.name);
    if (!name) errors.push('Name is required');
    const email = cell(raw.email).toLowerCase();
    if (email && !EMAIL_REGEX.test(email)) errors.push('Invalid email');
    const upi = cell(raw.upi).toLowerCase();
    if (upi && !UPI_REGEX.test(upi)) errors.push('Invalid UPI ID');

    const statusRaw = cell(raw.status).toUpperCase();
    let status = 'ACTIVE';
    if (statusRaw) {
      if (statusRaw === 'ACTIVE' || statusRaw === 'INACTIVE') status = statusRaw;
      else errors.push('Status must be ACTIVE or INACTIVE');
    }

    const subGroup = cell(raw.sub_group);
    let memberGroupName = null;
    if (subGroup) {
      const match = groups.get(subGroup.toLowerCase());
      if (!match) warnings.push(`Sub-group "${subGroup}" not found — will add with no group`);
      else memberGroupName = match;
    }

    const sortRaw = cell(raw.sort_order);
    let sortOrder = null;
    if (sortRaw) {
      const n = Number(sortRaw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) errors.push('Sort order must be a whole number');
      else sortOrder = n;
    }

    return {
      key: `r-${raw.rowNumber}-${pan || 'blank'}`,
      rowNumber: raw.rowNumber,
      pan,
      name,
      email: email || null,
      upi: upi || null,
      status,
      relationshipNote: cell(raw.relationship_note) || null,
      subGroup: subGroup || null,
      memberGroupName,
      sortOrder,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  });
}

export function toImportPayload(row) {
  return {
    pan: row.pan,
    displayName: row.name,
    email: row.email,
    upi: row.upi,
    status: row.status,
    relationshipNote: row.relationshipNote,
    subGroup: row.memberGroupName || null,
    sortOrder: row.sortOrder,
  };
}
