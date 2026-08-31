import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildExternalId, buildIdentityKey, normalizeCompanyName } from './identity.js';
import { estimatedListingPrice, gmpPercentage, isDuplicateGmpSample, summarizeGmpHistory, gmpChangedSignificantly } from './gmpCalc.js';
import { normalizeRegistrarCode } from './registrarNormalize.js';
import { normalizeLiveIpo, normalizeLiveStatus, normalizeMarketType, canAddCatalogToMyIpos, parseIstDateTime } from './normalize.js';
import { createMockIpoProvider } from './providers/mockIpoProvider.js';
import { mapDownstoxRow, parseDownstoxDateRange } from './providers/downstoxProvider.js';
import { applyNseDetails, mapNseListRow, parseNseDate, parseNseLot } from './providers/nseProvider.js';
import { mergeLiveIpoLists, mergeLiveIpoPair } from './mergeLiveIpos.js';
import { resolveActiveProviderName } from './providers/index.js';
import { maskPan, sanitizeForLog } from '../../utils/pan.js';
import { allotmentCheckGate } from './allotmentReady.js';

describe('identity / duplicate protection', () => {
  it('does not rely on IPO name alone', () => {
    const a = buildIdentityKey({ companyName: 'ABC Ltd', name: 'ABC IPO', openDate: '2026-08-10', closeDate: '2026-08-12' });
    const b = buildIdentityKey({ companyName: 'ABC Limited', name: 'ABC', openDate: '2026-08-10', closeDate: '2026-08-12' });
    const c = buildIdentityKey({ companyName: 'ABC Ltd', name: 'ABC IPO', openDate: '2026-09-01', closeDate: '2026-09-03' });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it('normalizes company suffixes', () => {
    assert.equal(normalizeCompanyName('KFin Technologies Limited IPO'), normalizeCompanyName('KFin Technologies Ltd'));
  });

  it('prefers provider external id', () => {
    assert.equal(buildExternalId({ externalId: 'hero-fincorp-ipo', name: 'Hero' }), 'hero-fincorp-ipo');
  });
});

describe('GMP calculation', () => {
  it('computes estimated listing price as issue + gmp', () => {
    assert.equal(estimatedListingPrice(110, 50), 160);
  });

  it('computes GMP percentage', () => {
    assert.equal(gmpPercentage(50, 100), 50);
    assert.equal(gmpPercentage(10, 172), 5.81);
  });

  it('does not fabricate values when issue price is missing', () => {
    assert.equal(estimatedListingPrice(null, 50), null);
    assert.equal(gmpPercentage(50, null), null);
  });

  it('skips duplicate samples in the same window', () => {
    const previous = { gmp: 50, recorded_at: new Date() };
    assert.equal(isDuplicateGmpSample(previous, 50, new Date(), 15 * 60 * 1000), true);
    assert.equal(isDuplicateGmpSample(previous, 55, new Date(), 15 * 60 * 1000), false);
  });

  it('summarizes history', () => {
    const summary = summarizeGmpHistory([
      { gmp: 50 }, { gmp: 55 }, { gmp: 60 }, { gmp: 58 }, { gmp: 65 },
    ]);
    assert.equal(summary.highest, 65);
    assert.equal(summary.lowest, 50);
    assert.equal(summary.current, 65);
    assert.equal(summary.change, 7);
  });

  it('detects significant GMP change', () => {
    assert.equal(gmpChangedSignificantly(50, 65, 20), true);
    assert.equal(gmpChangedSignificantly(50, 55, 20), false);
  });
});

describe('registrar normalization', () => {
  it('maps provider names to codes', () => {
    assert.equal(normalizeRegistrarCode('KFin Technologies Limited'), 'KFIN');
    assert.equal(normalizeRegistrarCode('MUFG Intime India Pvt Ltd'), 'LINK_INTIME');
    assert.equal(normalizeRegistrarCode('Bigshare Services Pvt Ltd'), 'BIGSHARE');
    assert.equal(normalizeRegistrarCode('SKYLINE FINANCIAL SERVICES PRIVATE LIMITED'), 'SKYLINE');
    assert.equal(normalizeRegistrarCode('Purva Sharegistry'), 'PURVA');
  });
});

describe('provider normalization', () => {
  it('never exposes raw provider keys as the public contract', () => {
    const row = normalizeLiveIpo({
      name: 'Yaashvi Jewellers IPO',
      bidding_start_date: '2026-05-25',
      bidding_end_date: '2026-05-27',
      minimum_price: 83,
      maximum_price: 83,
      issue_type: 'sme',
      status: 'open',
      lot_size: 3000,
      registrar_info: { name: 'SKYLINE FINANCIAL SERVICES PRIVATE LIMITED' },
      total_subscription: '1.27',
      id: 'yaashvi-jewellers-limited-ipo',
      symbol: 'YAASHVI',
    }, 'upstox');
    assert.equal(row.externalId, 'yaashvi-jewellers-limited-ipo');
    assert.equal(row.marketType, 'SME');
    assert.equal(row.status, 'CLOSED');
    assert.equal(row.priceMin, 83);
    assert.equal(row.registrarCode, 'SKYLINE');
    assert.equal(row.gmp, null);
    assert.ok(!('bidding_start_date' in row) || row.openDate === '2026-05-25');
    assert.equal(row.openDate, '2026-05-25');
  });

  it('parses IPO Guru list fields including GMP', () => {
    const row = normalizeLiveIpo({
      name: 'Adisoft Technologies',
      type: 'SME',
      open_date: '2026-04-23',
      close_date: '2026-04-27',
      price_band: '163-172',
      issue_price: '172',
      lot_size: '800',
      registrar: 'Kfin Technologies Ltd.',
      status: 'Open',
      gmp: { price: '10', percentage: '6' },
      subscription: { total: '1.99', qib: '3.65' },
    }, 'ipoguru');
    assert.equal(row.priceMin, 163);
    assert.equal(row.priceMax, 172);
    assert.equal(row.gmp, 10);
    assert.equal(row.estimatedListingPrice, 182);
    assert.equal(row.registrarCode, 'KFIN');
    assert.equal(row.subscriptionTotal, '1.99');
  });

  it('maps market type and status', () => {
    assert.equal(normalizeMarketType('regular'), 'MAINBOARD');
    assert.equal(normalizeMarketType('sme'), 'SME');
    assert.equal(normalizeLiveStatus('upcoming'), 'UPCOMING');
    assert.equal(normalizeLiveStatus('listed'), 'LISTED');
    assert.equal(canAddCatalogToMyIpos('OPEN'), true);
    assert.equal(canAddCatalogToMyIpos('UPCOMING'), true);
    assert.equal(canAddCatalogToMyIpos('CLOSED'), false);
    assert.equal(canAddCatalogToMyIpos('LISTED'), false);
  });

  it('uses issue dates over a stale Upcoming label', () => {
    const noonIst = new Date('2026-08-31T12:00:00+05:30');
    assert.equal(normalizeLiveStatus('Upcoming', {
      openDate: '2026-08-27',
      closeDate: '2026-08-31',
      listingDate: '2026-09-03',
      now: noonIst,
    }), 'OPEN');
    const afterClose = new Date('2026-08-31T17:00:00+05:30');
    assert.equal(normalizeLiveStatus('Upcoming', {
      openDate: '2026-08-27',
      closeDate: '2026-08-31',
      listingDate: '2026-09-03',
      now: afterClose,
    }), 'CLOSED');
  });

  it('keeps Listed when the provider already reported listing', () => {
    assert.equal(normalizeLiveStatus('Listed @ 961', {
      openDate: '2026-08-21',
      closeDate: '2026-08-25',
      now: new Date('2026-08-31T18:00:00+05:30'),
    }), 'LISTED');
  });
});

describe('Downstox public GMP feed', () => {
  it('parses bidding windows including cross-month ranges', () => {
    const now = new Date('2026-08-31T17:00:00+05:30');
    assert.deepEqual(parseDownstoxDateRange('27-31 August', now), {
      openDate: '2026-08-27',
      closeDate: '2026-08-31',
    });
    assert.deepEqual(parseDownstoxDateRange('28-1 September', now), {
      openDate: '2026-08-28',
      closeDate: '2026-09-01',
    });
    assert.deepEqual(parseDownstoxDateRange('1-3 September', now), {
      openDate: '2026-09-01',
      closeDate: '2026-09-03',
    });
  });

  it('maps Lumino to Closed after 5 PM IST on the close date', () => {
    const now = new Date('2026-08-31T17:04:00+05:30');
    const row = mapDownstoxRow({
      company: 'Lumino Industries',
      slug: 'lumino-industries',
      gmp: 60,
      priceBand: 82,
      estListing: 142,
      gainPct: 73.17,
      date: '27-31 August',
      type: 'Open',
      status: '31 Aug, 14:36',
    }, now);
    assert.equal(row.name, 'Lumino Industries IPO');
    assert.equal(row.openDate, '2026-08-27');
    assert.equal(row.closeDate, '2026-08-31');
    assert.equal(row.status, 'CLOSED');
    assert.equal(row.gmp, 60);
    assert.equal(row.issuePrice, 82);
    assert.equal(new Date(row.gmpUpdatedAt).toISOString(), new Date('2026-08-31T14:36:00+05:30').toISOString());
  });
});

describe('IST datetime parsing', () => {
  it('does not treat year-less Downstox stamps as 2001', () => {
    const now = new Date('2026-08-31T17:04:00+05:30');
    const d = parseIstDateTime('31 Aug, 14:36', now);
    assert.equal(d.toISOString(), new Date('2026-08-31T14:36:00+05:30').toISOString());
    assert.equal(parseIstDateTime('23 Apr 2026, 04:53 PM IST').toISOString(), new Date('2026-04-23T16:53:00+05:30').toISOString());
    assert.equal(parseIstDateTime(1788173403259).getUTCFullYear(), 2026);
  });
});

describe('mock provider contract', () => {
  it('implements the provider interface', async () => {
    const provider = createMockIpoProvider();
    const list = await provider.getLiveIpos();
    assert.ok(list.length >= 4);
    assert.ok(list.some((row) => row.marketType === 'SME'));
    assert.ok(list.some((row) => row.marketType === 'MAINBOARD'));
    for (const row of list) {
      assert.ok(row.externalId);
      assert.ok(row.identityKey);
      assert.ok(row.name);
      assert.ok(['MAINBOARD', 'SME'].includes(row.marketType));
      assert.ok(['UPCOMING', 'OPEN', 'CLOSED', 'LISTED'].includes(row.status));
    }
    const details = await provider.getIpoDetails(list[0].externalId);
    assert.equal(details.name, list[0].name);
  });
});

describe('PAN masking', () => {
  it('masks PAN for UI and logs', () => {
    assert.equal(maskPan('ABCDE1234F'), 'XXXXX1234F');
    assert.equal(sanitizeForLog('checked PAN ABCDE1234F for allotment'), 'checked PAN XXXXX1234F for allotment');
  });
});

describe('Live vs My IPO membership', () => {
  it('adding to My IPOs is a flag on membership, not a second catalog row', () => {
    const catalog = { id: 7, is_my_ipo: false };
    const afterAdd = { ...catalog, is_my_ipo: true };
    assert.equal(catalog.id, afterAdd.id);
    assert.equal(afterAdd.is_my_ipo, true);
  });
});

describe('NSE public IPO mapping', () => {
  it('parses NSE dates, lot size, and list rows', () => {
    assert.equal(parseNseDate('02-Sep-2026'), '2026-09-02');
    assert.equal(parseNseDate('27-Aug-2026'), '2026-08-27');
    assert.equal(parseNseLot('182 Equity Shares'), 182);
    assert.equal(parseNseLot('1,600'), 1600);
    const row = mapNseListRow({
      companyName: 'Lumino Industries Limited',
      symbol: 'LUMINO',
      series: 'EQ',
      status: 'Active',
      issueStartDate: '27-Aug-2026',
      issueEndDate: '31-Aug-2026',
      listingDate: '03-Sep-2026',
      issuePrice: 'Rs.78 - 82',
      issueSize: '30487804',
      noOfTime: 1.5,
    });
    assert.equal(row.symbol, 'LUMINO');
    assert.equal(row.openDate, '2026-08-27');
    assert.equal(row.closeDate, '2026-08-31');
    assert.equal(row.listingDate, '2026-09-03');
    assert.equal(row.priceMin, 78);
    assert.equal(row.priceMax, 82);
    assert.equal(row.marketType, 'MAINBOARD');
    assert.equal(row.sourceProvider, 'nse');
  });

  it('copies lot size and category subscription from NSE detail', () => {
    const base = mapNseListRow({
      companyName: 'Lumino Industries Limited',
      symbol: 'LUMINO',
      series: 'EQ',
      issueStartDate: '27-Aug-2026',
      issueEndDate: '31-Aug-2026',
    });
    const enriched = applyNseDetails(base, {
      issueInfo: {
        dataList: [
          { title: 'Bid Lot', value: '182 Equity Shares' },
          { title: 'Registrar', value: 'KFin Technologies Limited' },
        ],
      },
      bidDetails: [
        { category: 'Qualified Institutional Buyers (QIBs)', noOfTime: 2.1 },
        { category: 'Non Institutional Investors', noOfTime: 1.4 },
        { category: 'Retail Individual Investors (RIIs)', noOfTime: 0.8 },
        { category: 'Total', noOfTime: 1.2 },
      ],
    });
    assert.equal(enriched.lotSize, 182);
    assert.equal(enriched.subscriptionQib, '2.1');
    assert.equal(enriched.subscriptionNii, '1.4');
    assert.equal(enriched.subscriptionRetail, '0.8');
    assert.equal(enriched.subscriptionTotal, '1.2');
    assert.equal(enriched.registrarName, 'KFin Technologies Limited');
  });
});

describe('composite live IPO merge', () => {
  it('keeps NSE dates and fills GMP from Downstox', () => {
    const nse = mapNseListRow({
      companyName: 'Lumino Industries Limited',
      symbol: 'LUMINO',
      series: 'EQ',
      issueStartDate: '27-Aug-2026',
      issueEndDate: '31-Aug-2026',
      listingDate: '03-Sep-2026',
      issuePrice: 'Rs.78 - 82',
    });
    const downstox = mapDownstoxRow({
      company: 'Lumino Industries',
      slug: 'lumino-industries',
      gmp: 60,
      priceBand: 82,
      estListing: 142,
      gainPct: 73.17,
      date: '27-31 August',
      type: 'Open',
      status: '31 Aug, 14:36',
    }, new Date('2026-08-31T12:00:00+05:30'));
    const merged = mergeLiveIpoPair(nse, downstox);
    assert.equal(merged.symbol, 'LUMINO');
    assert.equal(merged.openDate, '2026-08-27');
    assert.equal(merged.closeDate, '2026-08-31');
    assert.equal(merged.listingDate, '2026-09-03');
    assert.equal(merged.gmp, 60);
    assert.equal(merged.estimatedListingPrice, 142);
    const list = mergeLiveIpoLists([[nse], [downstox]]);
    assert.equal(list.length, 1);
    assert.equal(list[0].sourceProvider, 'composite');
    assert.equal(list[0].gmp, 60);
    assert.equal(list[0].symbol, 'LUMINO');
  });
});

describe('free provider resolution', () => {
  it('uses the NSE + Downstox + IPO Alerts composite when no paid key is set', () => {
    const prevProvider = process.env.IPO_PROVIDER;
    const prevKey = process.env.IPO_API_KEY;
    const prevUpstox = process.env.UPSTOX_ACCESS_TOKEN;
    try {
      process.env.IPO_PROVIDER = 'ipoguru';
      delete process.env.IPO_API_KEY;
      delete process.env.UPSTOX_ACCESS_TOKEN;
      assert.equal(resolveActiveProviderName(), 'composite');
    } finally {
      if (prevProvider == null) delete process.env.IPO_PROVIDER;
      else process.env.IPO_PROVIDER = prevProvider;
      if (prevKey == null) delete process.env.IPO_API_KEY;
      else process.env.IPO_API_KEY = prevKey;
      if (prevUpstox == null) delete process.env.UPSTOX_ACCESS_TOKEN;
      else process.env.UPSTOX_ACCESS_TOKEN = prevUpstox;
    }
  });
});

describe('allotment result mapping', () => {
  const RESULT_TO_STATUS = {
    ALLOTTED: 'ALLOTED',
    PARTIALLY_ALLOTTED: 'PARTIALLY_ALLOTTED',
    NOT_ALLOTTED: 'NOT_ALLOTED',
    REJECTED: 'REJECTED',
    ERROR: 'ERROR',
  };
  it('keeps existing ALLOTED spelling for compatibility', () => {
    assert.equal(RESULT_TO_STATUS.ALLOTTED, 'ALLOTED');
    assert.notEqual(RESULT_TO_STATUS.ALLOTTED, 'ALLOTTED');
  });
  it('supports partial allotment and failed checks', () => {
    assert.equal(RESULT_TO_STATUS.PARTIALLY_ALLOTTED, 'PARTIALLY_ALLOTTED');
    assert.equal(RESULT_TO_STATUS.ERROR, 'ERROR');
  });
});

describe('allotment check gate (NSE/BSE timeline)', () => {
  const now = new Date('2026-08-31T12:00:00+05:30');

  it('blocks upcoming IPOs', () => {
    const g = allotmentCheckGate({
      catalog_status: 'UPCOMING',
      catalog_open_date: '2026-09-05',
      catalog_close_date: '2026-09-09',
    }, { now });
    assert.equal(g.ready, false);
    assert.match(g.reason, /not opened yet/i);
  });

  it('blocks IPOs still open on the exchange', () => {
    const g = allotmentCheckGate({
      catalog_status: 'OPEN',
      catalog_open_date: '2026-08-27',
      catalog_close_date: '2026-09-02',
    }, { now });
    assert.equal(g.ready, false);
    assert.match(g.reason, /still open/i);
  });

  it('blocks closed IPOs before the NSE/BSE allotment date', () => {
    const g = allotmentCheckGate({
      catalog_status: 'CLOSED',
      catalog_close_date: '2026-08-28',
      catalog_allotment_date: '2026-09-04',
    }, { now });
    assert.equal(g.ready, false);
    assert.match(g.reason, /allotment date is 2026-09-04/i);
  });

  it('allows check on the allotment date', () => {
    const g = allotmentCheckGate({
      catalog_status: 'CLOSED',
      catalog_close_date: '2026-08-28',
      catalog_allotment_date: '2026-08-31',
    }, { now });
    assert.equal(g.ready, true);
  });

  it('allows listed IPOs', () => {
    const g = allotmentCheckGate({
      catalog_status: 'LISTED',
      catalog_listing_date: '2026-08-30',
    }, { now });
    assert.equal(g.ready, true);
  });

  it('allows closed IPOs when allotment date is not published', () => {
    const g = allotmentCheckGate({
      catalog_status: 'CLOSED',
      catalog_close_date: '2026-08-28',
    }, { now });
    assert.equal(g.ready, true);
  });
});
