import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import client from '../api/client';

export type ProfitPdfQuery = {
  year?: string;
  months?: string;
};

function safeFileName(value: string) {
  const name = String(value || 'profit-analysis.pdf').replace(/[/\\?%*:|"<>]/g, '-');
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

function fileNameFromHeaders(headers: Record<string, unknown>) {
  const raw = String(headers['content-disposition'] || '');
  const match = /filename="?([^";]+)"?/i.exec(raw);
  return safeFileName(match?.[1] || `profit-analysis.pdf`);
}

async function readErrorMessage(data: ArrayBuffer) {
  try {
    const body = JSON.parse(new TextDecoder().decode(data));
    if (body?.error) return String(body.error);
  } catch {
    /* not JSON */
  }
  return 'Could not download PDF';
}

/** Download the same profit-analysis PDF the website uses. The server builds it. */
export async function fetchProfitAnalysisPdf(query: ProfitPdfQuery = {}) {
  const response = await client.get('/profit-shares/analysis/pdf', {
    params: query,
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  const contentType = String(response.headers['content-type'] || '');
  const bytes = response.data as ArrayBuffer;
  if (!contentType.includes('pdf')) {
    throw new Error(await readErrorMessage(bytes));
  }
  if (!bytes || bytes.byteLength < 5) throw new Error('Could not download PDF');

  const fileName = fileNameFromHeaders(response.headers as Record<string, unknown>);
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(bytes));
  return { file, fileName, bytes };
}

export async function shareProfitAnalysisPdf(query: ProfitPdfQuery = {}) {
  const { file } = await fetchProfitAnalysisPdf(query);
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Profit analysis PDF',
    UTI: 'com.adobe.pdf',
  });
  return { uri: file.uri };
}

export async function previewProfitAnalysisPdf(query: ProfitPdfQuery = {}) {
  const { file } = await fetchProfitAnalysisPdf(query);
  await Print.printAsync({ uri: file.uri });
  return true;
}

export async function profitAnalysisPdfBase64(query: ProfitPdfQuery = {}) {
  const { file, fileName } = await fetchProfitAnalysisPdf(query);
  const pdfBase64 = await file.base64();
  return { pdfBase64, fileName };
}
