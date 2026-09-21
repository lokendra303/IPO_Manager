import { AppError } from '../middleware/errorHandler.js';
import { normalizeEmail } from './validate.js';

const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_EMAILS = 5;

export function uniqueEmails(values) {
  const list = [];
  for (const value of values) {
    if (!value) continue;
    const email = normalizeEmail(value);
    if (!list.includes(email)) list.push(email);
  }
  if (!list.length) throw new AppError('Enter at least one email');
  if (list.length > MAX_EMAILS) throw new AppError(`You can send to at most ${MAX_EMAILS} emails`);
  return list;
}

export function decodePdfBase64(raw) {
  const cleaned = String(raw || '').replace(/^data:application\/pdf;base64,/i, '').replace(/\s/g, '');
  if (!cleaned) throw new AppError('PDF is required');
  const buf = Buffer.from(cleaned, 'base64');
  if (buf.length < 5 || buf.subarray(0, 5).toString() !== '%PDF-') {
    throw new AppError('Invalid PDF attachment');
  }
  if (buf.length > MAX_PDF_BYTES) throw new AppError('PDF is too large to email');
  return buf;
}

export function safePdfFileName(value, fallback) {
  const name = String(value || fallback || 'report.pdf')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

export function parsePdfEmailRequest(body, { fallbackEmail, fallbackFileName }) {
  const extras = Array.isArray(body?.extra)
    ? body.extra
    : String(body?.extra || '').split(/[,;]+/);
  const emails = uniqueEmails([body?.to || fallbackEmail, ...extras]);
  const [to, ...cc] = emails;
  return {
    to,
    cc,
    pdfBuffer: decodePdfBase64(body?.pdfBase64),
    filename: safePdfFileName(body?.fileName, fallbackFileName),
    summary: String(body?.summary || '').slice(0, 400),
  };
}

export function smtpAppError(err) {
  const msg = String(err?.message || '');
  if (msg.includes('Email is not configured')) {
    return new AppError('Email is not configured on the server. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.', 503);
  }
  return new AppError(msg || 'Could not send email', 502);
}
