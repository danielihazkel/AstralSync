import { notFound } from "next/navigation";
import type { HouseSystem } from "@astralsync/astro-core";
import { getProfileView } from "@/lib/snapshots";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import type { WizardInitial } from "@/components/onboarding/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit profile — AstralSync" };

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const view = await getProfileView(id);
  if (!view) notFound();
  const { profile } = view;

  const initial: WizardInitial = {
    birthDate: profile.birthDate,
    timeCertainty: profile.timeCertainty,
    birthTime: profile.birthTime ?? "",
    city: {
      geonameId: profile.birthCity?.geonameId ?? null,
      label: profile.birthCity
        ? [
            profile.birthCity.name,
            profile.birthCity.admin1,
            profile.birthCity.countryCode,
          ]
            .filter(Boolean)
            .join(", ")
        : `${profile.birthLat.toFixed(2)}°, ${profile.birthLng.toFixed(2)}°`,
      lat: profile.birthLat,
      lng: profile.birthLng,
      tzIana: profile.tzIana,
    },
    offsetOverridden: profile.offsetOverridden,
    overrideOffsetMinutes: profile.offsetOverridden
      ? profile.utcOffsetMinutes
      : null,
    displayName: profile.displayName,
    fullBirthName: profile.fullBirthName ?? "",
    transliteration: "",
    houseSystem: view.astro.houseSystem as HouseSystem,
  };

  return (
    <main>
      <h1>Edit {profile.displayName}</h1>
      <p style={{ color: "var(--text-muted)", margin: "0.35rem 0 1.5rem" }}>
        Changing birth data recomputes once and saves a new chart version —
        earlier versions stay readable.
      </p>
      <OnboardingWizard mode="edit" profileId={profile.id} initial={initial} />
    </main>
  );
}
