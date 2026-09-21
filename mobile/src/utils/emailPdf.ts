import * as Print from 'expo-print';
import client from '../api/client';

export async function htmlToPdfBase64(html: string) {
  const result = await Print.printToFileAsync({ html, base64: true });
  if (!result.base64) throw new Error('Could not create PDF');
  return result.base64;
}

export function parseExtraEmails(value: string) {
  return String(value || '')
    .split(/[,;\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export async function sendPdfEmail(
  endpoint: string,
  payload: {
    to: string;
    extra?: string[];
    fileName: string;
    pdfBase64: string;
    summary?: string;
    period?: string;
  }
) {
  const { data } = await client.post(endpoint, payload, { timeout: 45000 });
  return data as { success?: boolean; message?: string; to?: string };
}
