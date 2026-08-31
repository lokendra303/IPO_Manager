import { toSqlDateTime } from '../../utils/validate.js';

const DEDUPE_HOURS = 18;

export async function recordNotification(conn, {
  tenantId = null,
  catalogId = null,
  ipoId = null,
  type,
  title,
  body = null,
  payload = null,
}) {
  if (catalogId && type) {
    const [existing] = await conn.query(
      `SELECT id FROM ipo_notifications
       WHERE catalog_id = ? AND type = ? AND created_at >= (NOW() - INTERVAL ? HOUR)
       LIMIT 1`,
      [catalogId, type, DEDUPE_HOURS]
    );
    if (existing.length) return { created: false };
  }

  await conn.query(
    `INSERT INTO ipo_notifications
     (tenant_id, catalog_id, ipo_id, type, title, body, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      catalogId,
      ipoId,
      type,
      title,
      body,
      payload ? JSON.stringify(payload) : null,
      toSqlDateTime(new Date()),
    ]
  );
  return { created: true };
}

export const NOTIFICATION_TYPES = [
  'NEW_IPO',
  'IPO_OPENING_TOMORROW',
  'IPO_CLOSING_TODAY',
  'ALLOTMENT_TODAY',
  'LISTING_TOMORROW',
  'GMP_CHANGED',
  'ALLOTMENT_CHECKING_PENDING',
];

export async function scanDateNotifications(conn, catalogRows) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);

  for (const row of catalogRows) {
    const open = row.open_date ? String(row.open_date).slice(0, 10) : null;
    const close = row.close_date ? String(row.close_date).slice(0, 10) : null;
    const allot = row.allotment_date ? String(row.allotment_date).slice(0, 10) : null;
    const listing = row.listing_date ? String(row.listing_date).slice(0, 10) : null;

    if (open === tomorrowKey) {
      await recordNotification(conn, {
        catalogId: row.id,
        type: 'IPO_OPENING_TOMORROW',
        title: `${row.name} opens tomorrow`,
        body: `Subscription opens on ${open}`,
      });
    }
    if (close === todayKey) {
      await recordNotification(conn, {
        catalogId: row.id,
        type: 'IPO_CLOSING_TODAY',
        title: `${row.name} closes today`,
        body: `Last apply date is ${close}`,
      });
    }
    if (allot === todayKey) {
      await recordNotification(conn, {
        catalogId: row.id,
        type: 'ALLOTMENT_TODAY',
        title: `${row.name} allotment today`,
      });
    }
    if (listing === tomorrowKey) {
      await recordNotification(conn, {
        catalogId: row.id,
        type: 'LISTING_TOMORROW',
        title: `${row.name} lists tomorrow`,
      });
    }
  }
}
