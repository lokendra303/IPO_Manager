import crypto from 'crypto';

export function createSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function expiryFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function expiryFromNowMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function createOtp() {
  return String(crypto.randomInt(100000, 1000000));
}
