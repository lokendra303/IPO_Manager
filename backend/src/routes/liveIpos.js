import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';
import { getGmpHistory } from '../services/ipo/gmpService.js';
import { summarizeGmpHistory } from '../services/ipo/gmpCalc.js';
import {
  addCatalogToMyIpos,
  getLiveIpo,
  listLiveIpos,
} from '../services/ipo/catalogService.js';
import { cacheIsFresh, getSyncState, syncLiveIpos, syncOnCooldown } from '../services/ipo/syncService.js';
import { getConfiguredProviderName, resolveActiveProviderName } from '../services/ipo/providers/index.js';

const router = Router();

router.post('/sync', async (req, res, next) => {
  try {
    const state = await getSyncState(pool);
    if (syncOnCooldown(state)) {
      const waitMs = new Date(state.cooldown_until).getTime() - Date.now();
      return res.status(429).json({
        success: false,
        message: 'Sync cooldown active — try again in a moment',
        retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
      });
    }
    const result = await syncLiveIpos(pool, { force: true });
    if (!result.success) {
      const data = await listLiveIpos(pool, { tenantId: req.tenantId });
      return res.status(503).json({
        success: false,
        message: result.message || 'IPO provider temporarily unavailable',
        data,
      });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const state = await getSyncState(pool);
    let priorMeta = {};
    try {
      priorMeta = state?.last_result ? JSON.parse(state.last_result) : {};
    } catch {
      priorMeta = {};
    }
    const active = resolveActiveProviderName();
    const usingMock = active === 'mock';
    const switchedAwayFromMock = !usingMock && (priorMeta.provider === 'mock' || priorMeta.usedFallback);
    const switchedProvider = Boolean(priorMeta.provider) && priorMeta.provider !== active;
    const [[liveCount]] = await pool.query(
      "SELECT COUNT(*) AS c FROM ipo_catalog WHERE source_provider <> 'mock'"
    ).catch(() => [[{ c: 1 }]]);
    const needsLiveImport = !usingMock && Number(liveCount?.c || 0) === 0;
    if (usingMock || switchedAwayFromMock || switchedProvider || needsLiveImport
        || (!cacheIsFresh(state) && !syncOnCooldown(state))) {
      await syncLiveIpos(pool);
    }
    // Always return the full catalog. Status / type / search are applied in the UI
    // so a leftover `?type=MAINBOARD` cannot hide SME (or other) rows.
    const data = await listLiveIpos(pool, { tenantId: req.tenantId });
    const fresh = await getSyncState(pool);
    let syncMeta = {};
    try {
      syncMeta = fresh?.last_result ? JSON.parse(fresh.last_result) : {};
    } catch {
      syncMeta = {};
    }
    const configured = getConfiguredProviderName();
    const usedFallback = usingMock || syncMeta.provider === 'mock';
    res.json({
      success: true,
      data,
      lastSyncedAt: fresh?.last_success_at || null,
      lastError: fresh?.last_error || null,
      provider: syncMeta.provider || active || configured,
      usedFallback,
      total: data.length,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/gmp/history', async (req, res, next) => {
  try {
    const catalogId = parsePositiveInt(req.params.id, 'IPO id');
    const live = await getLiveIpo(pool, { tenantId: req.tenantId, catalogId });
    if (!live) throw new AppError('Live IPO not found', 404);
    const history = await getGmpHistory(pool, catalogId);
    res.json({
      success: true,
      current: {
        gmp: live.gmp,
        gmpPercentage: live.gmpPercentage,
        estimatedListingPrice: live.estimatedListingPrice,
        lastUpdated: live.gmpLastUpdated,
      },
      summary: summarizeGmpHistory(history),
      history,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/gmp', async (req, res, next) => {
  try {
    const catalogId = parsePositiveInt(req.params.id, 'IPO id');
    const live = await getLiveIpo(pool, { tenantId: req.tenantId, catalogId });
    if (!live) throw new AppError('Live IPO not found', 404);
    res.json({
      success: true,
      gmp: live.gmp,
      gmpPercentage: live.gmpPercentage,
      estimatedListingPrice: live.estimatedListingPrice,
      lastUpdated: live.gmpLastUpdated,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const catalogId = parsePositiveInt(req.params.id, 'IPO id');
    const live = await getLiveIpo(pool, { tenantId: req.tenantId, catalogId });
    if (!live) throw new AppError('Live IPO not found', 404);
    res.json({ success: true, data: live });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/add-to-my-ipos', async (req, res, next) => {
  try {
    const catalogId = parsePositiveInt(req.params.id, 'IPO id');
    const result = await withTransaction((conn) =>
      addCatalogToMyIpos(conn, {
        tenantId: req.tenantId,
        catalogId,
        userId: req.user?.userId,
      })
    );
    res.status(result.alreadyAdded ? 200 : 201).json({
      success: true,
      alreadyAdded: result.alreadyAdded,
      ipo: result.ipo,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/sync-gmp', async (req, res, next) => {
  try {
    parsePositiveInt(req.params.id, 'IPO id');
    const result = await syncLiveIpos(pool, { force: true, jobName: 'gmp' });
    if (!result.success) {
      return res.status(503).json({
        success: false,
        message: result.message || 'IPO provider temporarily unavailable',
      });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
