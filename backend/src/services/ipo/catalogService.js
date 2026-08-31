import { AppError } from '../../middleware/errorHandler.js';
import { serializeAllowedCategories } from '../../constants/ipoCategories.js';
import { toSqlDateTime } from '../../utils/validate.js';
import { serializeCatalogIpo } from './normalize.js';
import { VALID_REGISTRARS } from '../../utils/allotmentCheck.js';

function computeLotAmount(catalog) {
  const lot = Number(catalog.lot_size);
  const price = Number(catalog.issue_price ?? catalog.price_max ?? catalog.price_min);
  if (!Number.isFinite(lot) || lot <= 0 || !Number.isFinite(price) || price <= 0) return null;
  return Math.round(lot * price * 100) / 100;
}

export async function findMyIpoByCatalog(conn, tenantId, catalogId) {
  const [rows] = await conn.query(
    'SELECT * FROM ipos WHERE tenant_id = ? AND catalog_id = ? LIMIT 1',
    [tenantId, catalogId]
  );
  return rows[0] || null;
}

export async function addCatalogToMyIpos(conn, { tenantId, catalogId, userId = null }) {
  const [catalogRows] = await conn.query('SELECT * FROM ipo_catalog WHERE id = ?', [catalogId]);
  if (!catalogRows.length) throw new AppError('Live IPO not found', 404);
  const catalog = catalogRows[0];
  const live = serializeCatalogIpo(catalog);

  const existing = await findMyIpoByCatalog(conn, tenantId, catalogId);
  if (existing && !existing.is_invalid) {
    return { ipo: existing, alreadyAdded: true, catalog };
  }
  if (!live.canAddToMyIpos) {
    throw new AppError(
      live.status === 'LISTED'
        ? 'This IPO is listed and cannot be added to My IPOs.'
        : 'This IPO is closed and cannot be added to My IPOs.',
      400,
      { code: 'IPO_NOT_ADDABLE', details: { status: live.status } }
    );
  }
  if (existing && existing.is_invalid) {
    await conn.query(
      `UPDATE ipos SET is_invalid = 0, invalidated_at = NULL, added_to_my_ipo_at = ?
       WHERE id = ? AND tenant_id = ?`,
      [toSqlDateTime(new Date()), existing.id, tenantId]
    );
    const [rows] = await conn.query('SELECT * FROM ipos WHERE id = ?', [existing.id]);
    return { ipo: rows[0], alreadyAdded: false, catalog };
  }

  const lotAmount = computeLotAmount(catalog);
  if (lotAmount == null) {
    throw new AppError(
      'Cannot add this IPO yet — lot size or issue price is missing. Set them after the provider publishes the price band.',
      400
    );
  }

  const registrar = catalog.registrar_code && VALID_REGISTRARS.includes(catalog.registrar_code)
    ? catalog.registrar_code
    : null;
  const segment = catalog.market_type === 'SME' ? 'SME' : 'MAINBOARD';
  const teamStatus = 'OPEN';
  const now = toSqlDateTime(new Date());

  const [ins] = await conn.query(
    `INSERT INTO ipos (
       tenant_id, name, lot_amount_rii, lot_amount_hni, lot_amount, status,
       open_date, last_apply_date, listing_date, allotment_date,
       registrar, ipo_segment, allowed_categories,
       catalog_id, company_name, symbol, price_min, price_max, issue_price, lot_size, issue_size,
       exchange, source_provider, source_last_updated, added_to_my_ipo_at
     ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      catalog.name,
      lotAmount,
      lotAmount,
      teamStatus,
      catalog.open_date,
      catalog.close_date,
      catalog.listing_date,
      catalog.allotment_date,
      registrar,
      segment,
      serializeAllowedCategories(['RII']),
      catalog.id,
      catalog.company_name,
      catalog.symbol,
      catalog.price_min,
      catalog.price_max,
      catalog.issue_price,
      catalog.lot_size,
      catalog.issue_size,
      catalog.exchange,
      catalog.source_provider,
      catalog.source_last_updated,
      now,
    ]
  );

  const [rows] = await conn.query('SELECT * FROM ipos WHERE id = ?', [ins.insertId]);
  return { ipo: rows[0], alreadyAdded: false, catalog, userId };
}

export async function removeFromMyIpos(conn, { tenantId, ipoId, confirm = false }) {
  const [ipoRows] = await conn.query(
    'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',
    [ipoId, tenantId]
  );
  if (!ipoRows.length) throw new AppError('IPO not found', 404);
  const ipo = ipoRows[0];

  const [[apps]] = await conn.query(
    'SELECT COUNT(*) AS cnt FROM ipo_applications WHERE ipo_id = ? AND tenant_id = ?',
    [ipoId, tenantId]
  );
  const applicationCount = Number(apps.cnt || 0);

  if (applicationCount > 0 && !confirm) {
    throw new AppError(
      `This IPO has ${applicationCount} team application(s). Confirm to hide it from My IPOs without deleting records.`,
      409,
      { code: 'HAS_APPLICATIONS', details: { applicationCount } }
    );
  }

  if (applicationCount > 0) {
    await conn.query(
      `UPDATE ipos SET is_invalid = 1, invalidated_at = ? WHERE id = ? AND tenant_id = ?`,
      [toSqlDateTime(new Date()), ipoId, tenantId]
    );
    const [rows] = await conn.query('SELECT * FROM ipos WHERE id = ?', [ipoId]);
    return { ipo: rows[0], hidden: true, deleted: false, applicationCount };
  }

  await conn.query('DELETE FROM ipos WHERE id = ? AND tenant_id = ?', [ipoId, tenantId]);
  return { ipo, hidden: false, deleted: true, applicationCount: 0 };
}

export async function listLiveIpos(pool, { tenantId, status, marketType, q } = {}) {
  const where = ['1=1'];
  const params = [tenantId];
  if (status && status !== 'ALL') {
    where.push('c.status = ?');
    params.push(String(status).toUpperCase());
  }
  if (marketType === 'SME' || marketType === 'MAINBOARD') {
    where.push('c.market_type = ?');
    params.push(marketType);
  }
  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    where.push('(c.name LIKE ? OR c.company_name LIKE ? OR c.symbol LIKE ?)');
    params.push(like, like, like);
  }
  // Hide leftover demo rows once any live provider has written catalog data.
  where.push(`(
    c.source_provider <> 'mock'
    OR NOT EXISTS (SELECT 1 FROM ipo_catalog live WHERE live.source_provider <> 'mock' LIMIT 1)
  )`);
  const [rows] = await pool.query(
    `SELECT c.*,
            i.id AS my_ipo_id,
            i.added_to_my_ipo_at,
            CASE WHEN i.id IS NOT NULL AND COALESCE(i.is_invalid, 0) = 0 THEN 1 ELSE 0 END AS is_my_ipo
     FROM ipo_catalog c
     LEFT JOIN ipos i ON i.catalog_id = c.id AND i.tenant_id = ?
     WHERE ${where.join(' AND ')}
     ORDER BY
       FIELD(c.status, 'OPEN', 'UPCOMING', 'CLOSED', 'LISTED'),
       COALESCE(c.open_date, '9999-12-31') ASC, c.id DESC`,
    [...params]
  );
  const mapped = rows.map((row) => serializeCatalogIpo(row, {
    isMyIpo: Boolean(row.is_my_ipo),
    myIpoId: row.my_ipo_id || null,
  }));
  const rank = { OPEN: 0, UPCOMING: 1, CLOSED: 2, LISTED: 3 };
  mapped.sort((a, b) => {
    const byStatus = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    const ao = a.openDate || '9999-12-31';
    const bo = b.openDate || '9999-12-31';
    if (ao !== bo) return ao < bo ? -1 : 1;
    return (b.id || 0) - (a.id || 0);
  });
  return mapped;
}

export async function getLiveIpo(pool, { tenantId, catalogId }) {
  const [rows] = await pool.query(
    `SELECT c.*,
            i.id AS my_ipo_id,
            i.added_to_my_ipo_at,
            CASE WHEN i.id IS NOT NULL AND COALESCE(i.is_invalid, 0) = 0 THEN 1 ELSE 0 END AS is_my_ipo
     FROM ipo_catalog c
     LEFT JOIN ipos i ON i.catalog_id = c.id AND i.tenant_id = ?
     WHERE c.id = ?`,
    [tenantId, catalogId]
  );
  if (!rows.length) return null;
  return serializeCatalogIpo(rows[0], {
    isMyIpo: Boolean(rows[0].is_my_ipo),
    myIpoId: rows[0].my_ipo_id || null,
  });
}

export async function resolveCatalogIdForTenantIpo(pool, tenantId, ipoId) {
  const [rows] = await pool.query(
    'SELECT catalog_id FROM ipos WHERE id = ? AND tenant_id = ?',
    [ipoId, tenantId]
  );
  return rows[0]?.catalog_id || null;
}
