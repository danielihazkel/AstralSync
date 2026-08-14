"use client";

import CitySearch from "@/components/onboarding/CitySearch";
import type { CityOption } from "@/components/onboarding/types";
import { saveHomeLocation } from "@/lib/homeLocation";
import type { HomeLocation } from "@/lib/today";

/**
 * The shared "pick a home location" flow: city search with home-flavored
 * copy, persisting the choice before reporting it. Owners keep their own
 * trigger button and HomeLocation state (they compute from it); this
 * absorbs the CityOption→HomeLocation conversion that used to be pasted
 * into every consumer.
 */
export default function HomeLocationPicker({
  onPick,
  onCancel,
  cancelClassName,
}: {
  onPick: (loc: HomeLocation) => void;
  onCancel: () => void;
  cancelClassName?: string;
}) {
  function pickCity(city: CityOption) {
    const loc: HomeLocation = {
      label: city.label,
      lat: city.lat,
      lng: city.lng,
      tzIana: city.tzIana,
    };
    saveHomeLocation(loc);
    onPick(loc);
  }

  return (
    <div>
      <CitySearch
        selected={null}
        onSelect={pickCity}
        searchLabel="Search home city"
        manualLabel="Can’t find your city? Enter coordinates"
      />
      <button type="button" className={cancelClassName} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
