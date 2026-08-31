import { formatDateIst, normalizeLiveIpo } from '../normalize.js';

function shiftDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDateIst(d);
}

/**
 * Offline fixture provider so Live IPOs work without an external API key.
 * Names are fictional on purpose — never reuse live market IPO names/dates.
 * Used when IPO_PROVIDER=mock or when the configured provider has no credentials.
 */
export function createMockIpoProvider() {
  const samples = [
    {
      externalId: 'mock-adisoft-2026',
      name: 'Demo Open SME IPO',
      companyName: 'Demo Open SME Limited',
      symbol: 'DEMOSME',
      type: 'SME',
      status: 'Open',
      open_date: shiftDate(-1),
      close_date: shiftDate(2),
      allotment_date: shiftDate(3),
      listing_date: shiftDate(5),
      price_band: '163-172',
      issue_price: '172',
      lot_size: '800',
      issue_size: '₹74 Cr',
      listing_on: 'NSE',
      registrar: 'Kfin Technologies Ltd.',
      subscription: { qib: '3.65', nii: '1.80', retail: '1.13', total: '1.99', updated_at: new Date().toISOString() },
      gmp: { price: '10', percentage: '6', updated_at: new Date().toISOString() },
    },
    {
      externalId: 'mock-lumino-2026',
      name: 'Demo Upcoming Mainboard IPO',
      companyName: 'Demo Upcoming Mainboard Limited',
      symbol: 'DEMOMB',
      type: 'Mainboard',
      status: 'Upcoming',
      open_date: shiftDate(4),
      close_date: shiftDate(6),
      allotment_date: shiftDate(7),
      listing_date: shiftDate(9),
      price_band: '100-110',
      issue_price: '110',
      lot_size: '135',
      issue_size: '₹2,000 Cr',
      listing_on: 'BSE, NSE',
      registrar: 'MUFG Intime India Pvt Ltd',
      subscription: { qib: null, nii: null, retail: null, total: null, updated_at: null },
      gmp: { price: '50', percentage: '45', updated_at: new Date().toISOString() },
    },
    {
      externalId: 'mock-kwick-2026',
      name: 'Demo Closed SME IPO',
      companyName: 'Demo Closed SME Limited',
      symbol: 'DEMOCL',
      type: 'SME',
      status: 'Closed',
      open_date: shiftDate(-8),
      close_date: shiftDate(-5),
      allotment_date: shiftDate(-3),
      listing_date: shiftDate(1),
      price_band: '72-76',
      issue_price: '76',
      lot_size: '1600',
      issue_size: '₹48 Cr',
      listing_on: 'BSE',
      registrar: 'Bigshare Services Pvt Ltd',
      subscription: { qib: '42.1', nii: '18.4', retail: '9.2', total: '21.6', updated_at: new Date().toISOString() },
      gmp: { price: '28', percentage: '37', updated_at: new Date().toISOString() },
    },
    {
      externalId: 'mock-priority-2026',
      name: 'Demo Listed Mainboard IPO',
      companyName: 'Demo Listed Mainboard Limited',
      symbol: 'DEMOLIST',
      type: 'Mainboard',
      status: 'Listed',
      open_date: shiftDate(-20),
      close_date: shiftDate(-18),
      allotment_date: shiftDate(-16),
      listing_date: shiftDate(-14),
      listing_price: '142',
      price_band: '118-124',
      issue_price: '124',
      lot_size: '120',
      issue_size: '₹860 Cr',
      listing_on: 'NSE',
      registrar: 'KFin Technologies Limited',
      subscription: { qib: '12.4', nii: '6.1', retail: '3.8', total: '7.2', updated_at: new Date().toISOString() },
      gmp: { price: '18', percentage: '15', updated_at: new Date().toISOString() },
    },
  ];

  const byId = new Map(samples.map((s) => [s.externalId, s]));

  return {
    name: 'mock',
    supportsDedicatedGmp: false,
    async getLiveIpos() {
      return samples.map((row) => normalizeLiveIpo(row, 'mock'));
    },
    async getIpoDetails(externalId) {
      const row = byId.get(externalId);
      return row ? normalizeLiveIpo(row, 'mock') : null;
    },
    async getGmp(externalId) {
      const row = byId.get(externalId);
      if (!row) return null;
      return {
        gmp: Number(row.gmp.price),
        gmpPercentage: Number(row.gmp.percentage),
        updatedAt: row.gmp.updated_at,
      };
    },
    async getSubscription(externalId) {
      const row = byId.get(externalId);
      return row?.subscription || null;
    },
    async getRegistrar(externalId) {
      const row = byId.get(externalId);
      return row?.registrar || null;
    },
  };
}
