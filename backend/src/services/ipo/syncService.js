import { toSqlDateTime } from '../../utils/validate.js';
import { getIpoProvider, getConfiguredProviderName, providerHasCredentials } from './providers/index.js';
import { recordGmpSample } from './gmpService.js';
import { recordNotification, scanDateNotifications } from './notificationService.js';
import { parseIstDateTime } from './normalize.js';

let syncLock = null;

function sqlNow() {
  return toSqlDateTime(new Date());
}

async function markJob(conn, jobName, patch) {
  await conn.query(
    `INSERT INTO ipo_sync_state (job_name, last_started_at)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE job_name = job_name`,
    [jobName, sqlNow()]
  );
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (!fields.length) return;
  values.push(jobName);
  await conn.query(`UPDATE ipo_sync_state SET ${fields.join(', ')} WHERE job_name = ?`, values);
}

export async function getSyncState(pool, jobName = 'live_ipos') {
  const [rows] = await pool.query('SELECT * FROM ipo_sync_state WHERE job_name = ?', [jobName]);
  return rows[0] || null;
}

export function cacheIsFresh(state, ttlMinutes = Number(process.env.IPO_CACHE_TTL_MINUTES || 20)) {
  if (!state?.last_success_at) return false;
  const t = new Date(state.last_success_at).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ttlMinutes * 60 * 1000;
}

export function syncOnCooldown(state) {
  if (!state?.cooldown_until) return false;
  return new Date(state.cooldown_until).getTime() > Date.now();
}

async function upsertCatalogRow(conn, item, sourceProvider) {
  const now = sqlNow();
  const gmpUpdated = parseIstDateTime(item.gmpUpdatedAt);
  const subUpdated = parseIstDateTime(item.subscriptionUpdatedAt);

  const [existing] = await conn.query(
    `SELECT * FROM ipo_catalog
     WHERE (source_provider = ? AND external_id = ?)
        OR identity_key = ?
     LIMIT 1`,
    [sourceProvider, item.externalId, item.identityKey]
  );

  const payload = JSON.stringify(item.rawPayload || item);
  const values = {
    external_id: item.externalId,
    identity_key: item.identityKey,
    name: item.name,
    company_name: item.companyName,
    symbol: item.symbol,
    ipo_type: item.ipoType,
    market_type: item.marketType,
    status: item.status,
    open_date: item.openDate,
    close_date: item.closeDate,
    allotment_date: item.allotmentDate,
    listing_date: item.listingDate,
    price_min: item.priceMin,
    price_max: item.priceMax,
    issue_price: item.issuePrice,
    lot_size: item.lotSize,
    issue_size: item.issueSize,
    registrar_code: item.registrarCode,
    registrar_name: item.registrarName,
    exchange: item.exchange,
    source_provider: sourceProvider,
    source_last_updated: now,
    gmp: item.gmp,
    gmp_percentage: item.gmpPercentage,
    estimated_listing_price: item.estimatedListingPrice,
    gmp_updated_at: gmpUpdated ? toSqlDateTime(gmpUpdated) : (item.gmp != null ? now : null),
    subscription_qib: item.subscriptionQib,
    subscription_nii: item.subscriptionNii,
    subscription_retail: item.subscriptionRetail,
    subscription_total: item.subscriptionTotal,
    subscription_updated_at: subUpdated ? toSqlDateTime(subUpdated) : null,
    raw_payload: payload,
    updated_at: now,
  };

  if (existing.length) {
    const row = existing[0];
    await conn.query(
      `UPDATE ipo_catalog SET
         external_id = ?, identity_key = ?, name = ?, company_name = ?, symbol = ?,
         ipo_type = ?, market_type = ?, status = ?,
         open_date = ?, close_date = ?, allotment_date = ?, listing_date = ?,
         price_min = ?, price_max = ?, issue_price = ?, lot_size = ?, issue_size = ?,
         registrar_code = ?, registrar_name = ?, exchange = ?,
         source_provider = ?, source_last_updated = ?,
         gmp = ?, gmp_percentage = ?, estimated_listing_price = ?, gmp_updated_at = ?,
         subscription_qib = ?, subscription_nii = ?, subscription_retail = ?,
         subscription_total = ?, subscription_updated_at = ?,
         raw_payload = ?, updated_at = ?
       WHERE id = ?`,
      [
        values.external_id, values.identity_key, values.name, values.company_name, values.symbol,
        values.ipo_type, values.market_type, values.status,
        values.open_date, values.close_date, values.allotment_date, values.listing_date,
        values.price_min, values.price_max, values.issue_price, values.lot_size, values.issue_size,
        values.registrar_code, values.registrar_name, values.exchange,
        values.source_provider, values.source_last_updated,
        values.gmp, values.gmp_percentage, values.estimated_listing_price, values.gmp_updated_at,
        values.subscription_qib, values.subscription_nii, values.subscription_retail,
        values.subscription_total, values.subscription_updated_at,
        values.raw_payload, values.updated_at,
        row.id,
      ]
    );
    const [updated] = await conn.query('SELECT * FROM ipo_catalog WHERE id = ?', [row.id]);
    return { row: updated[0], created: false };
  }

  const [ins] = await conn.query(
    `INSERT INTO ipo_catalog (
       external_id, identity_key, name, company_name, symbol, ipo_type, market_type, status,
       open_date, close_date, allotment_date, listing_date,
       price_min, price_max, issue_price, lot_size, issue_size,
       registrar_code, registrar_name, exchange, source_provider, source_last_updated,
       gmp, gmp_percentage, estimated_listing_price, gmp_updated_at,
       subscription_qib, subscription_nii, subscription_retail, subscription_total, subscription_updated_at,
       raw_payload, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      values.external_id, values.identity_key, values.name, values.company_name, values.symbol,
      values.ipo_type, values.market_type, values.status,
      values.open_date, values.close_date, values.allotment_date, values.listing_date,
      values.price_min, values.price_max, values.issue_price, values.lot_size, values.issue_size,
      values.registrar_code, values.registrar_name, values.exchange,
      values.source_provider, values.source_last_updated,
      values.gmp, values.gmp_percentage, values.estimated_listing_price, values.gmp_updated_at,
      values.subscription_qib, values.subscription_nii, values.subscription_retail,
      values.subscription_total, values.subscription_updated_at,
      values.raw_payload, values.updated_at,
    ]
  );
  const [created] = await conn.query('SELECT * FROM ipo_catalog WHERE id = ?', [ins.insertId]);
  return { row: created[0], created: true };
}

/**
 * Fetch from the configured provider and upsert into ipo_catalog.
 * Never deletes existing rows. Never touches tenant is_my_ipo / ipos membership.
 */
export async function syncLiveIpos(pool, { force = false, jobName = 'live_ipos' } = {}) {
  if (syncLock) return syncLock;

  syncLock = (async () => {
    const conn = await pool.getConnection();
    const providerName = getConfiguredProviderName();
    const usingCredentials = providerHasCredentials(providerName);
    try {
      await markJob(conn, jobName, { last_started_at: sqlNow(), last_error: null });
      const provider = getIpoProvider();
      const items = await provider.getLiveIpos();
      let created = 0;
      let updated = 0;
      const catalogRows = [];

      for (const item of items) {
        if (!item) continue;
        const result = await upsertCatalogRow(conn, item, provider.name);
        catalogRows.push(result.row);
        if (result.created) {
          created += 1;
          await recordNotification(conn, {
            catalogId: result.row.id,
            type: 'NEW_IPO',
            title: `New IPO detected: ${result.row.name}`,
            body: `${result.row.market_type} · ${result.row.status}`,
          });
        } else {
          updated += 1;
        }
        await recordGmpSample(conn, result.row, {
          gmp: result.row.gmp,
          gmpPercentage: result.row.gmp_percentage,
          estimatedListingPrice: result.row.estimated_listing_price,
          source: provider.name,
        });
      }

      await scanDateNotifications(conn, catalogRows);

      const summary = {
        success: true,
        provider: provider.name,
        configuredProvider: providerName,
        usedFallback: provider.name === 'mock' && providerName !== 'mock',
        fetched: items.length,
        created,
        updated,
        syncedAt: new Date().toISOString(),
      };
      await markJob(conn, jobName, {
        last_finished_at: sqlNow(),
        last_success_at: sqlNow(),
        last_error: null,
        last_result: JSON.stringify(summary),
        cooldown_until: force ? toSqlDateTime(new Date(Date.now() + 2 * 60 * 1000)) : null,
      });
      if (!usingCredentials && providerName !== 'mock' && (provider.name === 'composite' || provider.name === 'downstox' || provider.name === 'nse')) {
        summary.message = 'Using free NSE + Downstox + IPO Alerts feeds';
      } else if (!usingCredentials && providerName !== 'mock') {
        summary.message = 'IPO provider API key is not set; showing mock live IPO data';
      }
      return summary;
    } catch (err) {
      const message = err.message || 'IPO provider temporarily unavailable';
      console.error('[ipo-sync]', message);
      await markJob(conn, jobName, {
        last_finished_at: sqlNow(),
        last_error: message,
        last_result: JSON.stringify({ success: false, message }),
      });
      return {
        success: false,
        message: 'IPO provider temporarily unavailable',
        provider: providerName,
      };
    } finally {
      conn.release();
    }
  })();

  try {
    return await syncLock;
  } finally {
    syncLock = null;
  }
}

export async function syncGmpForActive(pool) {
  return syncLiveIpos(pool, { jobName: 'gmp' });
}
