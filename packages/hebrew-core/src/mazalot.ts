import type { HebrewMonthKey, MazalEntry } from "./types";

/**
 * Month mazalot (Nisan = taleh/Aries … Adar = dagim/Pisces). Adar I and
 * Adar II share the single `adar` entry.
 */
export const MONTH_MAZAL: Record<HebrewMonthKey, MazalEntry> = {
  nisan: { month: "nisan", mazal: "taleh", hebrew: "טלה", sign: "aries" },
  iyyar: { month: "iyyar", mazal: "shor", hebrew: "שור", sign: "taurus" },
  sivan: { month: "sivan", mazal: "teomim", hebrew: "תאומים", sign: "gemini" },
  tamuz: { month: "tamuz", mazal: "sartan", hebrew: "סרטן", sign: "cancer" },
  av: { month: "av", mazal: "aryeh", hebrew: "אריה", sign: "leo" },
  elul: { month: "elul", mazal: "betulah", hebrew: "בתולה", sign: "virgo" },
  tishrei: { month: "tishrei", mazal: "moznayim", hebrew: "מאזניים", sign: "libra" },
  cheshvan: { month: "cheshvan", mazal: "akrav", hebrew: "עקרב", sign: "scorpio" },
  kislev: { month: "kislev", mazal: "keshet", hebrew: "קשת", sign: "sagittarius" },
  tevet: { month: "tevet", mazal: "gedi", hebrew: "גדי", sign: "capricorn" },
  shvat: { month: "shvat", mazal: "dli", hebrew: "דלי", sign: "aquarius" },
  adar: { month: "adar", mazal: "dagim", hebrew: "דגים", sign: "pisces" },
};

const MONTH_NUMBER_KEYS: readonly HebrewMonthKey[] = [
  "nisan",
  "iyyar",
  "sivan",
  "tamuz",
  "av",
  "elul",
  "tishrei",
  "cheshvan",
  "kislev",
  "tevet",
  "shvat",
  "adar", // 12 = Adar / Adar I
  "adar", // 13 = Adar II
];

/**
 * hebcal month number (1=Nisan … 12=Adar/Adar I, 13=Adar II) → content key.
 * Numeric on purpose: month-name strings are display-only (hebcal spells
 * Shvat as "Sh'vat") and must never be parsed.
 */
export function monthKeyFromMonthNumber(month: number): HebrewMonthKey {
  const key = MONTH_NUMBER_KEYS[month - 1];
  if (!key) throw new RangeError(`Invalid Hebrew month number: ${month}`);
  return key;
}
