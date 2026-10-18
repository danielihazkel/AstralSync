import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import type { WizardDraft } from "@/components/onboarding/types";
import { momentFromQuery } from "@/lib/momentQuery";

export const metadata = { title: "New profile — AstralSync" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A moment handed over from /chart (?date=&time=&lat=&lng=&tz=&label=)
  // prefills the date, time and place; anything malformed is just dropped.
  const raw = await searchParams;
  const moment = momentFromQuery({
    get: (name) => {
      const v = raw[name];
      return typeof v === "string" ? v : null;
    },
  });
  const prefill: Partial<WizardDraft> = {
    ...(moment.date ? { birthDate: moment.date } : {}),
    ...(moment.time ? { birthTime: moment.time, timeCertainty: "exact" as const } : {}),
    ...(moment.place ? { city: { geonameId: null, ...moment.place } } : {}),
  };
  return (
    <main>
      <h1>New profile</h1>
      <p style={{ color: "var(--text-muted)", margin: "0.35rem 0 1.5rem" }}>
        A few questions, one calculation, stored forever.
      </p>
      <OnboardingWizard mode="create" prefill={prefill} />
    </main>
  );
}
