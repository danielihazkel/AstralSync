/**
 * One-time disclosure before the first AI generation on this browser.
 *
 * The personal-data policy (see the header of lib/promptData.ts) sends the
 * person's raw birth date, time and place, their full numerology derivation
 * and their recorded life events to whatever provider READING_LLM points at
 * — and the shipped default points at a third-party API. That is a
 * deliberate choice, but it is not one the user should discover by reading
 * the source, so the app states it once, in the app, before the first
 * generation rather than after it.
 *
 * Per-browser like every other preference here (lib/chartSettings is the
 * idiom): it records that this person has been told, which is a property of
 * the reader, not of the chart.
 */

const KEY = "llm.disclosureAck";

/** Bumped only if what we send materially changes — that is a new disclosure,
 *  not the same one. */
export const DISCLOSURE_VERSION = 1;

/** What the dialog says, kept beside the flag so the two stay in step. */
export const DISCLOSURE_POINTS = [
  "your birth date, time and place, exactly as you entered them",
  "your full chart and numerology derivations",
  "any life events you have recorded for this profile",
] as const;

export function hasAcknowledgedLlm(): boolean {
  try {
    return window.localStorage.getItem(KEY) === String(DISCLOSURE_VERSION);
  } catch {
    // Private mode / blocked storage: ask again rather than assume consent.
    return false;
  }
}

export function acknowledgeLlm(): void {
  try {
    window.localStorage.setItem(KEY, String(DISCLOSURE_VERSION));
  } catch {
    // Nothing to do — the dialog simply appears again next time.
  }
}
