import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';
import { getGmpHistory } from '../services/ipo/gmpService.js';
import { summarizeGmpHistory } from '../services/ipo/gmpCalc.js';
import { serializeCatalogIpo } from '../services/ipo/normalize.js';

const router = Router();

function dateOnly(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s || s.startsWith('0000-00-00')) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function serializeMyIpo(row) {
  const listingDate = dateOnly(row.listing_date);
  return {
    ...row,
    listing_date: listingDate,
    listingDate,
    catalog: row.catalog_id
      ? serializeCatalogIpo({
          id: row.catalog_id,
          name: row.catalog_name || row.name,
          company_name: row.company_name,
          symbol: row.symbol,
          ipo_type: row.ipo_type,
          market_type: row.ipo_segment,
          status: row.catalog_status,
          open_date: row.open_date,
          close_date: row.last_apply_date,
          allotment_date: row.allotment_date,
          listing_date: listingDate,
          price_min: row.price_min,
          price_max: row.price_max,
          issue_price: row.issue_price,
          lot_size: row.lot_size,
          issue_size: row.issue_size,
          registrar_code: row.registrar,
          registrar_name: row.catalog_registrar_name,
          exchange: row.exchange,
          source_provider: row.source_provider,
          source_last_updated: row.source_last_updated,
          gmp: row.catalog_gmp,
          gmp_percentage: row.catalog_gmp_percentage,
          estimated_listing_price: row.catalog_estimated_listing_price,
          gmp_updated_at: row.catalog_gmp_updated_at,
          subscription_qib: row.catalog_subscription_qib,
          subscription_nii: row.catalog_subscription_nii,
          subscription_retail: row.catalog_subscription_retail,
          subscription_total: row.catalog_subscription_total,
          subscription_updated_at: row.catalog_subscription_updated_at,
        })
      : null,
    gmp: row.catalog_gmp != null ? Number(row.catalog_gmp) : null,
    gmpPercentage: row.catalog_gmp_percentage != null ? Number(row.catalog_gmp_percentage) : null,
    estimatedListingPrice: row.catalog_estimated_listing_price != null
      ? Number(row.catalog_estimated_listing_price)
      : null,
    expectedProfit: Number(row.expected_profit || 0),
  };
}

const MY_IPO_SELECT = `
  SELECT i.*,
    c.name AS catalog_name,
    c.status AS catalog_status,
    c.gmp AS catalog_gmp,
    c.gmp_percentage AS catalog_gmp_percentage,
    c.estimated_listing_price AS catalog_estimated_listing_price,
    c.gmp_updated_at AS catalog_gmp_updated_at,
    c.registrar_name AS catalog_registrar_name,
    c.subscription_qib AS catalog_subscription_qib,
    c.subscription_nii AS catalog_subscription_nii,
    c.subscription_retail AS catalog_subscription_retail,
    c.subscription_total AS catalog_subscription_total,
    c.subscription_updated_at AS catalog_subscription_updated_at,
    (SELECT COUNT(*) FROM ipo_applications a WHERE a.ipo_id = i.id) AS application_count,
    (SELECT COUNT(*) FROM ipo_applications a WHERE a.ipo_id = i.id AND a.allotment_status IN ('ALLOTED', 'PARTIALLY_ALLOTTED')) AS allotted_count,
    (SELECT COUNT(*) FROM ipo_applications a WHERE a.ipo_id = i.id AND a.allotment_status = 'NOT_ALLOTED') AS not_allotted_count,
    (SELECT COUNT(*) FROM ipo_applications a WHERE a.ipo_id = i.id AND a.allotment_status IN ('PENDING', 'CHECKING', 'RETRY')) AS pending_allotment_count,
    (
      SELECT COALESCE(SUM(
        CASE
          WHEN a.allotment_status IN ('ALLOTED', 'PARTIALLY_ALLOTTED') AND a.profit_loss IS NOT NULL THEN a.profit_loss
          WHEN a.allotment_status IN ('ALLOTED', 'PARTIALLY_ALLOTTED') AND c.gmp IS NOT NULL AND i.lot_size IS NOT NULL
            THEN COALESCE(a.allotted_lots, 1) * i.lot_size * c.gmp
          ELSE 0
        END
      ), 0)
      FROM ipo_applications a WHERE a.ipo_id = i.id
    ) AS expected_profit
`;

router.get('/', async (req, res, next) => {
  try {
    const q = req.query.q || req.query.search;
    const where = ['i.tenant_id = ?', 'COALESCE(i.is_invalid, 0) = 0'];
    const params = [req.tenantId];
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      where.push('(i.name LIKE ? OR i.company_name LIKE ? OR i.symbol LIKE ?)');
      params.push(like, like, like);
    }
    const [rows] = await pool.query(
      `${MY_IPO_SELECT}
       FROM ipos i
       LEFT JOIN ipo_catalog c ON c.id = i.catalog_id
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(i.open_date, DATE(i.created_at)) DESC, i.id DESC`,
      params
    );
    res.json({ success: true, data: rows.map(serializeMyIpo) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/gmp/history', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [rows] = await pool.query(
      'SELECT catalog_id FROM ipos WHERE id = ? AND tenant_id = ?',
      [ipoId, req.tenantId]
    );
    if (!rows.length) throw new AppError('IPO not found', 404);
    if (!rows[0].catalog_id) {
      return res.json({ success: true, current: null, summary: summarizeGmpHistory([]), history: [] });
    }
    const history = await getGmpHistory(pool, rows[0].catalog_id);
    const [cat] = await pool.query(
      'SELECT gmp, gmp_percentage, estimated_listing_price, gmp_updated_at FROM ipo_catalog WHERE id = ?',
      [rows[0].catalog_id]
    );
    res.json({
      success: true,
      current: cat[0]
        ? {
            gmp: cat[0].gmp != null ? Number(cat[0].gmp) : null,
            gmpPercentage: cat[0].gmp_percentage != null ? Number(cat[0].gmp_percentage) : null,
            estimatedListingPrice: cat[0].estimated_listing_price != null ? Number(cat[0].estimated_listing_price) : null,
            lastUpdated: cat[0].gmp_updated_at,
          }
        : null,
      summary: summarizeGmpHistory(history),
      history,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const ipoId = parsePositiveInt(req.params.id, 'IPO id');
    const [rows] = await pool.query(
      `${MY_IPO_SELECT}
       FROM ipos i
       LEFT JOIN ipo_catalog c ON c.id = i.catalog_id
       WHERE i.id = ? AND i.tenant_id = ?`,
      [ipoId, req.tenantId]
    );
    if (!rows.length) throw new AppError('IPO not found', 404);
    res.json({ success: true, data: serializeMyIpo(rows[0]) });
  } catch (err) {
    next(err);
  }
});

export default router;
