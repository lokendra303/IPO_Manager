import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';
import { getGmpHistory, presentGmpHistory, toGmpCurrent } from '../services/ipo/gmpService.js';
import { serializeCatalogIpo, toDate } from '../services/ipo/normalize.js';

const router = Router();

function dateOnly(value) {
  return toDate(value);
}

function serializeMyIpo(row) {
  const listingDate = dateOnly(row.listing_date || row.catalog_listing_date);
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
    c.listing_date AS catalog_listing_date,
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
    COALESCE(stats.application_count, 0) AS application_count,
    COALESCE(stats.allotted_count, 0) AS allotted_count,
    COALESCE(stats.not_allotted_count, 0) AS not_allotted_count,
    COALESCE(stats.pending_allotment_count, 0) AS pending_allotment_count,
    COALESCE(stats.expected_profit, 0) AS expected_profit
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
       LEFT JOIN (
         SELECT ipo_id,
           COUNT(*) AS application_count,
           SUM(CASE WHEN allotment_status IN ('ALLOTED', 'PARTIALLY_ALLOTTED') THEN 1 ELSE 0 END) AS allotted_count,
           SUM(CASE WHEN allotment_status = 'NOT_ALLOTED' THEN 1 ELSE 0 END) AS not_allotted_count,
           SUM(CASE WHEN allotment_status IN ('PENDING', 'CHECKING', 'RETRY') THEN 1 ELSE 0 END) AS pending_allotment_count,
           COALESCE(SUM(CASE
             WHEN allotment_status IN ('ALLOTED', 'PARTIALLY_ALLOTTED') AND profit_loss IS NOT NULL THEN profit_loss
             ELSE 0
           END), 0) AS expected_profit
         FROM ipo_applications
         WHERE tenant_id = ?
         GROUP BY ipo_id
       ) stats ON stats.ipo_id = i.id
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(i.open_date, DATE(i.created_at)) DESC, i.id DESC`,
      [req.tenantId, ...params]
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
      return res.json({ success: true, current: null, ...presentGmpHistory([]) });
    }
    const historyRows = await getGmpHistory(pool, rows[0].catalog_id);
    const [cat] = await pool.query(
      'SELECT gmp, gmp_percentage, estimated_listing_price, gmp_updated_at, issue_price FROM ipo_catalog WHERE id = ?',
      [rows[0].catalog_id]
    );
    const current = toGmpCurrent(cat[0]);
    res.json({
      success: true,
      current,
      ...presentGmpHistory(historyRows, current),
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
