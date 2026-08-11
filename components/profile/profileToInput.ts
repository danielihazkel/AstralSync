import type { HouseSystem } from "@astralsync/astro-core";
import type { ProfileData } from "@/lib/view-types";

/**
 * Rebuild the full `ProfileInput` payload from a serialized profile so a
 * single-field change (house system) can go through the existing PUT route.
 * `utcOffsetMinutes` is included only when it was a manual override —
 * otherwise the stored value is just the resolved offset and the server
 * re-resolves it.
 */
export function profileToInput(profile: ProfileData, houseSystem: HouseSystem) {
  return {
    displayName: profile.displayName,
    fullBirthName: profile.fullBirthName,
    hebrewBirthName: profile.hebrewBirthName,
    nameScript: profile.nameScript,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    timeCertainty: profile.timeCertainty,
    birthCityGeonameId: profile.birthCity?.geonameId ?? null,
    birthLat: profile.birthLat,
    birthLng: profile.birthLng,
    tzIana: profile.tzIana,
    utcOffsetMinutes: profile.offsetOverridden
      ? profile.utcOffsetMinutes
      : undefined,
    offsetOverridden: profile.offsetOverridden,
    houseSystem,
  };
}
