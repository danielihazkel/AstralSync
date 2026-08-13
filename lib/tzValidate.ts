/**
 * Whether `zone` names a timezone the runtime's IANA database knows —
 * validates client-supplied zones (manual-location onboarding) before they
 * reach offset resolution. Lives apart from lib/tz.ts on purpose: that
 * module loads geo-tz (Node fs), while this pure Intl probe is safe in the
 * client bundle (lib/validation.ts rides along with the onboarding wizard).
 */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
