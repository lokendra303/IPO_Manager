export function actionTagColor(action = '') {
  if (action.startsWith('IPO_')) return '#0891b2';
  if (action.startsWith('ADMIN_')) return '#dc2626';
  if (action.startsWith('MEMBER_') && !action.includes('ISSUE')) return '#2563eb';
  if (action.startsWith('GROUP_')) return '#7c3aed';
  if (action.startsWith('PROVIDER_') || action.startsWith('BANK_')) return '#d97706';
  if (action.includes('ISSUE')) return '#ea580c';
  if (action.startsWith('SETTINGS_')) return '#dc2626';
  if (action.startsWith('PROFIT_')) return '#059669';
  if (action.startsWith('AUTH_')) return '#64748b';
  return '#64748b';
}

export function formatMetadataKey(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

export function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
