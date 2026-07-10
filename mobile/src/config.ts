import Constants from 'expo-constants';

function normalizeBaseUrl(url: string | undefined): string {
  const base = (url || 'https://ipo-manager-one.vercel.app/api').trim();
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

type ExtraConfig = { apiBaseUrl?: string };

function readExtra(): ExtraConfig | undefined {
  const c = Constants as {
    expoConfig?: { extra?: ExtraConfig };
    manifest?: { extra?: ExtraConfig };
    manifest2?: { extra?: ExtraConfig };
  };
  return c.expoConfig?.extra ?? c.manifest2?.extra ?? c.manifest?.extra;
}

export const config = {
  apiBaseUrl: normalizeBaseUrl(
    readExtra()?.apiBaseUrl || process.env.EXPO_PUBLIC_API_BASE_URL
  ),
};
