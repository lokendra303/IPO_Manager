import { AppError } from '../middleware/errorHandler.js';

export function parsePositiveInt(value, fieldName = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError(`Invalid ${fieldName}`);
  }
  return n;
}

export function parseAmount(value, { allowNegative = false, allowZero = false, fieldName = 'amount' } = {}) {
  if (value === undefined || value === null || value === '') {
    throw new AppError(`${fieldName} is required`);
  }
  const n = Number(value);
  if (Number.isNaN(n)) throw new AppError(`${fieldName} must be a valid number`);
  if (!allowZero && n === 0) throw new AppError(`${fieldName} must be non-zero`);
  if (!allowNegative && n < 0) throw new AppError(`${fieldName} must be positive`);
  return n;
}

export function parseOptionalAmount(value, fieldName = 'amount') {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) throw new AppError(`Invalid ${fieldName}`);
  return n;
}

export function parseDate(value, fieldName = 'date') {
  if (!value) return new Date();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid ${fieldName}`);
  return d;
}

export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') throw new AppError('Email is required');
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new AppError('Invalid email format');
  return e;
}

export const ALLOTMENT_STATUSES = ['PENDING', 'ALLOTED', 'NOT_ALLOTED', 'NOT_APPLIED'];

export function validateAllotmentStatus(status) {
  if (status && !ALLOTMENT_STATUSES.includes(status)) {
    throw new AppError(`Invalid allotment status. Must be one of: ${ALLOTMENT_STATUSES.join(', ')}`);
  }
}

export function dedupeIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const parsed = ids.map((id) => parsePositiveInt(id, 'member id'));
  return [...new Set(parsed)];
}

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;

export function normalizePan(pan) {
  const p = String(pan).toUpperCase().trim();
  if (!PAN_REGEX.test(p)) throw new AppError('Invalid PAN format (e.g. ABCDE1234F)');
  return p;
}
