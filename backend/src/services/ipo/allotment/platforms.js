import { mufgPlatform } from './mufgProvider.js';
import { kfinPlatform } from './kfinProvider.js';
import { skylinePlatform } from './skylineProvider.js';
import { bigsharePlatform, cameoPlatform, purvaPlatform } from './htmlListProviders.js';

export const ALLOTMENT_PLATFORMS = [
  mufgPlatform,
  kfinPlatform,
  skylinePlatform,
  bigsharePlatform,
  cameoPlatform,
  purvaPlatform,
];

const ALL_NAMES = ALLOTMENT_PLATFORMS.map((p) => p.name);

export function captchaPortalMessage(platform) {
  return `Allotment is live on ${platform.name} (${platform.url}). That portal uses a captcha, so auto-check cannot read PANs. Leave members pending or mark them by hand.`;
}

export function unpublishedAllotmentMessage() {
  return `Allotment is not published yet on ${ALL_NAMES.join(', ')}.`;
}

export async function resolveAllotmentPlatform(ipoNames, registrarCode) {
  const results = await Promise.allSettled(
    ALLOTMENT_PLATFORMS.map(async (platform) => ({
      platform,
      company: await platform.resolve(ipoNames),
    }))
  );

  const hits = [];
  const errors = [];
  let lookedUp = false;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      lookedUp = true;
      if (result.value.company) hits.push(result.value);
    } else {
      errors.push(result.reason);
    }
  }

  if (registrarCode) {
    const preferred = hits.find((hit) => hit.platform.registrarCode === registrarCode);
    if (preferred) return { ...preferred, errors, lookedUp };
  }

  const auto = hits.find((hit) => hit.platform.canCheck);
  if (auto) return { ...auto, errors, lookedUp };

  if (hits.length) return { ...hits[0], errors, lookedUp };
  return { platform: null, company: null, errors, lookedUp };
}
