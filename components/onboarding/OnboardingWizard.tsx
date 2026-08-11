"use client";

import { useRouter } from "next/navigation";
import { useReducer, useState } from "react";
import type { HouseSystem } from "@astralsync/astro-core";
import { profileInputSchema } from "@/lib/validation";
import { TIME_CERTAINTY_LABELS, formatBirthDate, formatOffset } from "@/components/format";
import CitySearch from "./CitySearch";
import OffsetReview from "./OffsetReview";
import { detectScript, type WizardDraft, type WizardInitial } from "./types";
import styles from "./wizard.module.css";

const STEPS = ["Date", "Time", "Birthplace", "Time zone", "Name", "Review"];

const EMPTY_DRAFT: WizardDraft = {
  birthDate: "",
  timeCertainty: "exact",
  birthTime: "",
  city: null,
  offsetOverridden: false,
  overrideOffsetMinutes: null,
  displayName: "",
  fullBirthName: "",
  hebrewBirthName: "",
  transliteration: "",
};

type Action = { kind: "patch"; patch: Partial<WizardDraft> };

function reducer(draft: WizardDraft, action: Action): WizardDraft {
  return { ...draft, ...action.patch };
}

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Draft → API payload (the shape `profileInputSchema` validates). */
function buildPayload(draft: WizardDraft, houseSystem: HouseSystem) {
  const script = detectScript(draft.fullBirthName);
  let fullBirthName: string | null = draft.fullBirthName.trim() || null;
  let hebrewBirthName: string | null = draft.hebrewBirthName.trim() || null;
  if (script === "hebrew") {
    // Hebrew typed into the main field auto-routes to the dedicated Hebrew
    // name (stepError blocks the case where both fields hold Hebrew).
    hebrewBirthName = hebrewBirthName ?? fullBirthName;
    fullBirthName = null;
  } else if (script === "other") {
    // Non-Latin, non-Hebrew names go through the transliteration path —
    // Pythagorean numerology needs Latin letters. Empty transliteration
    // means the user skipped name numbers.
    fullBirthName = draft.transliteration.trim() || null;
  }
  return {
    displayName: draft.displayName.trim(),
    fullBirthName,
    hebrewBirthName,
    nameScript: "latin" as const,
    birthDate: draft.birthDate,
    birthTime: draft.timeCertainty === "unknown" ? null : draft.birthTime,
    timeCertainty: draft.timeCertainty,
    birthCityGeonameId: draft.city?.geonameId ?? null,
    birthLat: draft.city?.lat,
    birthLng: draft.city?.lng,
    tzIana: draft.city?.tzIana,
    utcOffsetMinutes: draft.offsetOverridden
      ? (draft.overrideOffsetMinutes ?? undefined)
      : undefined,
    offsetOverridden: draft.offsetOverridden,
    houseSystem,
  };
}

function stepError(step: number, draft: WizardDraft): string | null {
  switch (step) {
    case 0:
      return isRealDate(draft.birthDate)
        ? null
        : "Enter a valid birth date (YYYY-MM-DD).";
    case 1:
      if (draft.timeCertainty === "unknown") return null;
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.birthTime)
        ? null
        : "Enter the birth time as HH:MM (24-hour).";
    case 2:
      return draft.city ? null : "Select the birth city.";
    case 3:
      if (draft.offsetOverridden && draft.overrideOffsetMinutes === null) {
        return "Set the override offset, or turn the override off.";
      }
      return null;
    case 4: {
      if (!draft.displayName.trim()) {
        return "Enter a display name for this profile.";
      }
      const hebrew = draft.hebrewBirthName.trim();
      if (hebrew && !/[֐-׿]/.test(hebrew)) {
        return "The Hebrew name must contain Hebrew letters.";
      }
      if (hebrew && detectScript(draft.fullBirthName) === "hebrew") {
        return "Hebrew appears in both name fields — keep it in the Hebrew name field only.";
      }
      return null;
    }
    default:
      return null;
  }
}

export default function OnboardingWizard({
  mode,
  profileId,
  initial,
}: {
  mode: "create" | "edit";
  profileId?: number;
  initial?: WizardInitial;
}) {
  const router = useRouter();
  const [draft, dispatch] = useReducer(reducer, initial ?? EMPTY_DRAFT);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const houseSystem: HouseSystem = initial?.houseSystem ?? "placidus";

  const patch = (p: Partial<WizardDraft>) => {
    dispatch({ kind: "patch", patch: p });
    setError(null);
  };

  function next() {
    const err = stepError(step, draft);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setSubmitError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    const payload = buildPayload(draft, houseSystem);
    const parsed = profileInputSchema.safeParse(payload);
    if (!parsed.success) {
      setSubmitError(
        parsed.error.issues
          .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
          .join(" · "),
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const url =
      mode === "edit" ? `/api/profiles/${profileId}` : "/api/profiles";
    const res = await fetch(url, {
      method: mode === "edit" ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (!res) {
      setSubmitting(false);
      setSubmitError("Request failed — is the server running?");
      return;
    }
    if (res.ok) {
      const view = await res.json();
      router.push(`/profiles/${view.profile.id}`);
      router.refresh();
      return;
    }
    setSubmitting(false);
    const body = await res.json().catch(() => null);
    if (body?.error === "unknown_city") {
      setStep(2);
      setError("That city no longer exists in the local dataset — pick again.");
    } else if (body?.error === "conflict") {
      setSubmitError(
        "This profile was edited elsewhere at the same time. Reload the page and try again.",
      );
    } else if (body?.error === "invalid_input") {
      setSubmitError(
        (body.issues ?? [])
          .map(
            (i: { path: (string | number)[]; message: string }) =>
              `${i.path.join(".") || "input"}: ${i.message}`,
          )
          .join(" · ") || "Invalid input.",
      );
    } else {
      setSubmitError("Something went wrong saving the profile.");
    }
  }

  const script = detectScript(draft.fullBirthName);
  const payloadPreview = buildPayload(draft, houseSystem);

  return (
    <div className={styles.wizard}>
      <ol className={styles.steps} aria-label="Onboarding steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i === step ? styles.stepActive : styles.step}
            aria-current={i === step ? "step" : undefined}
          >
            {label}
          </li>
        ))}
      </ol>

      <section className={styles.panel}>
        {step === 0 && (
          <>
            <h2>When were you born?</h2>
            <label className={styles.field}>
              Birth date
              <input
                type="date"
                value={draft.birthDate}
                onChange={(e) => patch({ birthDate: e.target.value })}
              />
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <h2>What time?</h2>
            <div role="radiogroup" aria-label="Birth time certainty">
              {(["exact", "approx", "unknown"] as const).map((c) => (
                <label key={c} className={styles.radioRow}>
                  <input
                    type="radio"
                    name="timeCertainty"
                    checked={draft.timeCertainty === c}
                    onChange={() => patch({ timeCertainty: c })}
                  />
                  {TIME_CERTAINTY_LABELS[c]}
                </label>
              ))}
            </div>
            {draft.timeCertainty !== "unknown" && (
              <label className={styles.field}>
                Birth time (24-hour)
                <input
                  type="time"
                  value={draft.birthTime}
                  onChange={(e) => patch({ birthTime: e.target.value })}
                />
              </label>
            )}
            {draft.timeCertainty === "approx" && (
              <p className={styles.hint}>
                Time-sensitive placements (Ascendant, houses, a Moon near a
                sign boundary) will be marked as uncertain.
              </p>
            )}
            {draft.timeCertainty === "unknown" && (
              <p className={styles.notice}>
                No problem — you&apos;ll get a <strong>solar chart</strong>:
                planets in signs and the aspects between them. The Ascendant,
                the twelve houses, and exact Moon degrees depend on the time of
                day, so they&apos;ll be left out rather than guessed.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h2>Where were you born?</h2>
            <CitySearch
              selected={draft.city}
              onSelect={(city) =>
                patch({
                  city,
                  // A new place invalidates a manual offset from the old one.
                  offsetOverridden: false,
                  overrideOffsetMinutes: null,
                })
              }
            />
          </>
        )}

        {step === 3 && draft.city && (
          <>
            <h2>Check the UTC offset</h2>
            <OffsetReview
              tz={draft.city.tzIana}
              date={draft.birthDate}
              time={draft.timeCertainty === "unknown" ? null : draft.birthTime}
              unknownTime={draft.timeCertainty === "unknown"}
              overridden={draft.offsetOverridden}
              overrideMinutes={draft.overrideOffsetMinutes}
              onOverrideChange={(overridden, minutes) =>
                patch({
                  offsetOverridden: overridden,
                  overrideOffsetMinutes: minutes,
                })
              }
            />
          </>
        )}

        {step === 4 && (
          <>
            <h2>Who is this chart for?</h2>
            <label className={styles.field}>
              Display name
              <input
                type="text"
                value={draft.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
                placeholder="e.g. Mom, Daniel, D."
                maxLength={100}
              />
            </label>
            <label className={styles.field}>
              Full birth name <span className={styles.optional}>optional</span>
              <input
                type="text"
                value={draft.fullBirthName}
                onChange={(e) => patch({ fullBirthName: e.target.value })}
                placeholder="Name exactly as on the birth certificate"
                maxLength={200}
              />
            </label>
            <p className={styles.hint}>
              Why we ask: the full birth name is only used to calculate the
              Destiny/Expression and Soul Urge numbers. It never leaves this
              machine, and you can skip it — the Life Path number comes from
              the birth date alone.
            </p>
            <label className={styles.field}>
              Hebrew name <span className={styles.optional}>optional</span>
              <input
                type="text"
                dir="rtl"
                lang="he"
                value={draft.hebrewBirthName}
                onChange={(e) => patch({ hebrewBirthName: e.target.value })}
                placeholder="למשל דניאל בן יעקב"
                maxLength={200}
              />
            </label>
            <p className={styles.hint}>
              Why we ask: the Hebrew name is used natively for the{" "}
              <strong>gematria</strong> Destiny number (standard letter values,
              final forms handled) and the mispar-katan name reading on the
              Mazal tab. It can accompany the Latin name — you get both
              systems. Soul Urge is not offered for unvocalized Hebrew.
            </p>
            {script === "hebrew" && (
              <p className={styles.notice}>
                Hebrew detected in the birth-name field — it will be used as
                the <strong>Hebrew name</strong> (gematria). Add a Latin name
                above as well if you also want Pythagorean numerology.
              </p>
            )}
            {script === "other" && (
              <>
                <p className={styles.notice}>
                  This name has no Latin or Hebrew letters. Pythagorean
                  numerology works on Latin letters, so add a Latin
                  transliteration below — or leave it empty to skip the name
                  numbers.
                </p>
                <label className={styles.field}>
                  Latin transliteration
                  <input
                    type="text"
                    value={draft.transliteration}
                    onChange={(e) => patch({ transliteration: e.target.value })}
                    placeholder="e.g. Ivan Petrov"
                    maxLength={200}
                  />
                </label>
              </>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h2>Review</h2>
            <dl className={styles.review}>
              <dt>Display name</dt>
              <dd>{draft.displayName || "—"}</dd>
              <dt>Birth date</dt>
              <dd>{draft.birthDate ? formatBirthDate(draft.birthDate) : "—"}</dd>
              <dt>Birth time</dt>
              <dd>
                {draft.timeCertainty === "unknown"
                  ? "Unknown — solar chart"
                  : `${draft.birthTime} (${TIME_CERTAINTY_LABELS[draft.timeCertainty].toLowerCase()})`}
              </dd>
              <dt>Birthplace</dt>
              <dd>{draft.city?.label ?? "—"}</dd>
              <dt>UTC offset</dt>
              <dd>
                {draft.offsetOverridden && draft.overrideOffsetMinutes !== null
                  ? `${formatOffset(draft.overrideOffsetMinutes)} (manual override)`
                  : "resolved automatically"}
              </dd>
              <dt>Birth name</dt>
              <dd>
                {payloadPreview.fullBirthName ?? "not provided"}
                {payloadPreview.fullBirthName && " (Pythagorean)"}
              </dd>
              <dt>Hebrew name</dt>
              <dd>
                {payloadPreview.hebrewBirthName ? (
                  <>
                    <span lang="he" dir="rtl">
                      {payloadPreview.hebrewBirthName}
                    </span>{" "}
                    (gematria)
                  </>
                ) : (
                  "not provided"
                )}
              </dd>
            </dl>
            {mode === "edit" && (
              <p className={styles.hint}>
                Changing birth data creates a new chart version — earlier
                versions stay readable in the history.
              </p>
            )}
            {submitError && <p className={styles.error}>{submitError}</p>}
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </section>

      <div className={styles.nav}>
        {step > 0 && (
          <button type="button" className={styles.backBtn} onClick={back}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className={styles.nextBtn} onClick={next}>
            Next
          </button>
        ) : (
          <button
            type="button"
            className={styles.nextBtn}
            onClick={submit}
            disabled={submitting}
          >
            {submitting
              ? "Computing chart…"
              : mode === "edit"
                ? "Save changes"
                : "Create chart"}
          </button>
        )}
      </div>
    </div>
  );
}
