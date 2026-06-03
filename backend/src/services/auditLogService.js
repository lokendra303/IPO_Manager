import { pool } from '../db/pool.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'password_hash',
  'token',
  'passwordHash',
]);

export function sanitizeAuditMetadata(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function pathOnly(originalUrl) {
  return originalUrl.split('?')[0].replace(/^\/api/, '') || '/';
}

function idFromPath(path) {
  const match = path.match(/\/(\d+)(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

const RULES = [
  {
    method: 'POST',
    pattern: /^\/members\/?$/,
    action: 'MEMBER_CREATE',
    entityType: 'member',
    summary: (req) => `Added member ${req.body?.displayName || req.body?.pan || ''}`.trim(),
  },
  {
    method: 'PATCH',
    pattern: /^\/members\/\d+$/,
    action: 'MEMBER_UPDATE',
    entityType: 'member',
    summary: (req, path) => {
      const parts = [];
      if (req.body?.displayName) parts.push(`name → ${req.body.displayName}`);
      if (req.body?.status) parts.push(`status → ${req.body.status}`);
      if (req.body?.memberGroupId !== undefined) parts.push('sub-group updated');
      return parts.length ? `Updated member #${idFromPath(path)}: ${parts.join(', ')}` : `Updated member #${idFromPath(path)}`;
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/members\/\d+$/,
    action: 'MEMBER_DELETE',
    entityType: 'member',
    summary: (_req, path) => `Deleted member #${idFromPath(path)}`,
  },
  {
    method: 'POST',
    pattern: /^\/member-groups\/?$/,
    action: 'GROUP_CREATE',
    entityType: 'member_group',
    summary: (req) => `Created sub-group "${req.body?.name || ''}"`.trim(),
  },
  {
    method: 'PATCH',
    pattern: /^\/member-groups\/\d+$/,
    action: 'GROUP_UPDATE',
    entityType: 'member_group',
    summary: (req, path) => `Updated sub-group #${idFromPath(path)}${req.body?.name ? ` → ${req.body.name}` : ''}`,
  },
  {
    method: 'PUT',
    pattern: /^\/member-groups\/\d+\/members$/,
    action: 'GROUP_MEMBERS',
    entityType: 'member_group',
    summary: (req, path) => {
      const count = Array.isArray(req.body?.memberIds) ? req.body.memberIds.length : 0;
      return `Assigned ${count} member(s) to sub-group #${idFromPath(path)}`;
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/member-groups\/\d+$/,
    action: 'GROUP_DELETE',
    entityType: 'member_group',
    summary: (_req, path) => `Removed sub-group #${idFromPath(path)}`,
  },
  {
    method: 'POST',
    pattern: /^\/ipos\/?$/,
    action: 'IPO_CREATE',
    entityType: 'ipo',
    summary: (req) => `Created IPO "${req.body?.name || ''}"`.trim(),
  },
  {
    method: 'PATCH',
    pattern: /^\/ipos\/\d+$/,
    action: 'IPO_UPDATE',
    entityType: 'ipo',
    summary: (req, path) => `Updated IPO #${idFromPath(path)}${req.body?.name ? ` → ${req.body.name}` : ''}`,
  },
  {
    method: 'POST',
    pattern: /^\/ipos\/\d+\/close$/,
    action: 'IPO_CLOSE',
    entityType: 'ipo',
    summary: (_req, path) => `Closed IPO #${idFromPath(path)}`,
  },
  {
    method: 'POST',
    pattern: /^\/ipos\/\d+\/reopen$/,
    action: 'IPO_REOPEN',
    entityType: 'ipo',
    summary: (_req, path) => `Reopened IPO #${idFromPath(path)}`,
  },
  {
    method: 'POST',
    pattern: /^\/ipos\/\d+\/distribute$/,
    action: 'IPO_DISTRIBUTE',
    entityType: 'ipo',
    summary: (req, path) => {
      const count = Array.isArray(req.body?.memberIds) ? req.body.memberIds.length : 0;
      return `Distributed IPO funds to ${count} member(s) for IPO #${idFromPath(path)}`;
    },
  },
  {
    method: 'POST',
    pattern: /^\/ipos\/applications\/\d+\/receive$/,
    action: 'IPO_RECEIVE',
    entityType: 'ipo_application',
    summary: (_req, path) => `Recorded fund return for application #${idFromPath(path)}`,
  },
  {
    method: 'PATCH',
    pattern: /^\/ipo-applications\/bulk$/,
    action: 'IPO_APPLICATIONS_BULK',
    entityType: 'ipo_application',
    summary: (req) => {
      const count = Array.isArray(req.body?.updates) ? req.body.updates.length : 0;
      return `Bulk updated ${count} IPO application(s)`;
    },
  },
  {
    method: 'POST',
    pattern: /^\/fund-providers\/?$/,
    action: 'PROVIDER_CREATE',
    entityType: 'fund_provider',
    summary: (req) => `Added fund provider "${req.body?.name || ''}"`.trim(),
  },
  {
    method: 'PATCH',
    pattern: /^\/fund-providers\/\d+$/,
    action: 'PROVIDER_UPDATE',
    entityType: 'fund_provider',
    summary: (_req, path) => `Updated fund provider #${idFromPath(path)}`,
  },
  {
    method: 'POST',
    pattern: /^\/fund-providers\/\d+\/transactions$/,
    action: 'PROVIDER_TRANSACTION',
    entityType: 'fund_provider',
    summary: (req, path) => {
      const amt = req.body?.amount;
      const type = req.body?.type || 'transaction';
      return `Provider #${idFromPath(path)} ${type}${amt != null ? ` ₹${amt}` : ''}`;
    },
  },
  {
    method: 'POST',
    pattern: /^\/bank-accounts\/?$/,
    action: 'BANK_ACCOUNT_CREATE',
    entityType: 'bank_account',
    summary: (req) => `Added bank account "${req.body?.label || ''}"`.trim(),
  },
  {
    method: 'PATCH',
    pattern: /^\/bank-accounts\/\d+$/,
    action: 'BANK_ACCOUNT_UPDATE',
    entityType: 'bank_account',
    summary: (_req, path) => `Updated bank account #${idFromPath(path)}`,
  },
  {
    method: 'POST',
    pattern: /^\/bank-accounts\/transfer$/,
    action: 'BANK_TRANSFER',
    entityType: 'bank_account',
    summary: (req) => `Transferred ₹${req.body?.amount ?? '?'} between bank accounts`,
  },
  {
    method: 'POST',
    pattern: /^\/profit-shares\/preview$/,
    action: 'PROFIT_SHARE_PREVIEW',
    entityType: 'profit_share',
    summary: (req) => `Previewed profit share for IPO #${req.body?.ipoId ?? '?'}`,
  },
  {
    method: 'POST',
    pattern: /^\/profit-shares\/distribute$/,
    action: 'PROFIT_SHARE_DISTRIBUTE',
    entityType: 'profit_share',
    summary: (req) => `Distributed profit share for IPO #${req.body?.ipoId ?? '?'}`,
  },
  {
    method: 'PATCH',
    pattern: /^\/member-issues\/\d+$/,
    action: 'MEMBER_ISSUE_UPDATE',
    entityType: 'member_issue',
    summary: (req, path) => {
      const status = req.body?.status;
      return status === 'RESOLVED'
        ? `Resolved member issue #${idFromPath(path)}`
        : status === 'OPEN'
          ? `Reopened member issue #${idFromPath(path)}`
          : `Updated member issue #${idFromPath(path)}`;
    },
  },
  {
    method: 'POST',
    pattern: /^\/member-portal\/issues$/,
    action: 'MEMBER_ISSUE_CREATE',
    entityType: 'member_issue',
    summary: (req) => {
      const note = String(req.body?.note || '').trim();
      const preview = note.length > 80 ? `${note.slice(0, 80)}…` : note;
      return preview ? `Member raised issue: ${preview}` : 'Member raised an issue';
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/settings\/team$/,
    action: 'SETTINGS_TEAM',
    entityType: 'settings',
    summary: (req) => `Updated team name → "${req.body?.tenantName || ''}"`.trim(),
  },
  {
    method: 'PATCH',
    pattern: /^\/settings\/email$/,
    action: 'SETTINGS_EMAIL',
    entityType: 'settings',
    summary: (req) => `Changed account email → ${req.body?.email || ''}`.trim(),
  },
  {
    method: 'PATCH',
    pattern: /^\/settings\/password$/,
    action: 'SETTINGS_PASSWORD',
    entityType: 'settings',
    summary: () => 'Changed account password',
  },
];

function resolveRule(req) {
  const apiPath = pathOnly(req.originalUrl);
  return RULES.find((r) => r.method === req.method && r.pattern.test(apiPath));
}

async function resolveActor(user) {
  if (!user) return { actorType: 'manager', actorId: 0, actorLabel: 'System' };

  if (user.role === 'member') {
    const [rows] = await pool.query(
      'SELECT display_name, pan FROM members WHERE id = ? AND tenant_id = ?',
      [user.memberId, user.tenantId]
    );
    const m = rows[0];
    return {
      actorType: 'member',
      actorId: user.memberId,
      actorLabel: m?.display_name || m?.pan || `Member #${user.memberId}`,
    };
  }

  const [rows] = await pool.query('SELECT email FROM users WHERE id = ?', [user.userId]);
  return {
    actorType: 'manager',
    actorId: user.userId,
    actorLabel: rows[0]?.email || `User #${user.userId}`,
  };
}

export async function writeAuditLog({
  tenantId,
  actorType,
  actorId,
  actorLabel,
  action,
  entityType = null,
  entityId = null,
  summary,
  metadata = null,
  ipAddress = null,
}) {
  if (!tenantId || !action || !summary) return;

  await pool.query(
    `INSERT INTO audit_logs
     (tenant_id, actor_type, actor_id, actor_label, action, entity_type, entity_id, summary, metadata, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      actorType,
      actorId,
      actorLabel.slice(0, 255),
      action.slice(0, 64),
      entityType?.slice(0, 64) ?? null,
      entityId ?? null,
      summary.slice(0, 500),
      metadata ? JSON.stringify(metadata) : null,
      ipAddress?.slice(0, 45) ?? null,
    ]
  );
}

export async function recordAuditFromRequest(req) {
  if (!req.user?.tenantId) return;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
  if (req.originalUrl.split('?')[0].startsWith('/api/audit-logs')) return;

  const custom = req.audit;
  const rule = resolveRule(req);
  if (!custom && !rule) return;

  const apiPath = pathOnly(req.originalUrl);
  const actor = await resolveActor(req.user);

  const action = custom?.action || rule.action;
  const entityType = custom?.entityType ?? rule?.entityType ?? null;
  const entityId = custom?.entityId ?? idFromPath(apiPath) ?? null;
  const summary =
    custom?.summary ||
    (typeof rule.summary === 'function' ? rule.summary(req, apiPath) : rule.action);
  const metadata = custom?.metadata ?? sanitizeAuditMetadata(req.body);

  await writeAuditLog({
    tenantId: req.user.tenantId,
    ...actor,
    action,
    entityType,
    entityId,
    summary,
    metadata,
    ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
  });
}

export function setAudit(req, entry) {
  req.audit = { ...req.audit, ...entry };
}
