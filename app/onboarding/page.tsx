import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

export const metadata = { title: "New profile — AstralSync" };

export default function OnboardingPage() {
  return (
    <main>
      <h1>New profile</h1>
      <p style={{ color: "var(--text-muted)", margin: "0.35rem 0 1.5rem" }}>
        A few questions, one calculation, stored forever.
      </p>
      <OnboardingWizard mode="create" />
    </main>
  );
}
