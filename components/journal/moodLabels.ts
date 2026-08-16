import type { JournalMood } from "@/lib/journalMeta";

/** Display labels for the 5-point mood scale (enum keys stay neutral). */
export const MOOD_LABELS: Record<JournalMood, string> = {
  very_low: "Rough",
  low: "Low",
  neutral: "Even",
  high: "Good",
  very_high: "Great",
};
