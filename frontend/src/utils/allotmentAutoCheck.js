import client from '../api/client';

export const ALLOTMENT_CHECKABLE = new Set(['PENDING', 'CHECKING', 'RETRY', 'ERROR']);

export function allotmentCheckAccess(ipo) {
  if (!ipo) return { ready: false, reason: 'IPO not loaded' };
  if (ipo.allotmentCheckReady === false) {
    return {
      ready: false,
      reason: ipo.allotmentCheckBlockedReason || 'Allotment is not open on NSE/BSE yet.',
    };
  }
  return { ready: true, reason: null };
}

export function allotmentStatusOf(row) {
  return row?.allotmentStatus || row?.allotment_status || 'PENDING';
}

export function pickAllotmentTargets(applications, recheck) {
  return (applications || []).filter((row) => {
    const status = allotmentStatusOf(row);
    if (recheck) return status !== 'NOT_APPLIED';
    return ALLOTMENT_CHECKABLE.has(status);
  });
}

export function sameAllotmentId(a, b) {
  return Number(a) === Number(b);
}

export function applyAllotmentResult(row, result) {
  if (!row || !result || result.skipped) return row;
  const status = result.status || result.allotmentStatus || result.allotment_status;
  if (!status) return row;
  return {
    ...row,
    allotmentStatus: status,
    allotment_status: status,
    allottedLots: result.allottedLots ?? row.allottedLots,
    allotted_lots: result.allottedLots ?? row.allotted_lots,
    applicationNumber: result.applicationNumber ?? row.applicationNumber,
    checkedAt: new Date().toISOString(),
    allotment_checked_at: new Date().toISOString(),
  };
}

export async function checkAllotmentSequentially({
  ipoId,
  targets,
  onStart,
  onProgress,
  onRow,
  onQueue,
}) {
  const stats = {
    checked: 0,
    allotted: 0,
    notAllotted: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
    results: [],
    message: null,
    providerLabel: null,
  };
  const list = targets || [];
  onStart?.({ total: list.length });

  for (let i = 0; i < list.length; i += 1) {
    const app = list[i];
    onProgress?.({
      index: i,
      total: list.length,
      id: app.id,
      name: app.name || app.display_name,
      phase: 'checking',
      providerLabel: stats.providerLabel,
    });
    const { data } = await client.post(
      `/ipos/${ipoId}/allotment/auto-check`,
      { applicationId: app.id },
      { timeout: 45000 }
    );
    if (data.providerLabel) stats.providerLabel = data.providerLabel;
    if (data.message && !data.checked && !(data.results || []).length) {
      stats.message = data.message;
      onProgress?.({
        index: i,
        total: list.length,
        id: app.id,
        name: app.name || app.display_name,
        phase: 'blocked',
        message: data.message,
        providerLabel: data.providerLabel,
      });
      return stats;
    }
    const row = data.results?.[0] || null;
    if (row) stats.results.push(row);
    stats.checked += data.checked || 0;
    stats.allotted += data.allotted || 0;
    stats.notAllotted += data.notAllotted || 0;
    stats.skipped += data.skipped || 0;
    stats.failed += data.failed || 0;
    stats.remaining = data.remaining ?? stats.remaining;
    onQueue?.(data.applications || null, data.counts || null);
    onRow?.(row, app);
    onProgress?.({
      index: i,
      total: list.length,
      id: app.id,
      name: app.name || app.display_name,
      phase: 'done',
      row,
      providerLabel: data.providerLabel,
    });
  }
  return stats;
}
