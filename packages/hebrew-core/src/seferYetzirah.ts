import type { HebrewMonthKey, SeferYetzirahEntry } from "./types";

/**
 * The twelve simple letters and their month / tribe / faculty
 * correspondences, per the Gra recension of Sefer Yetzirah ch. 5 as printed
 * in Aryeh Kaplan's edition ("Sefer Yetzirah: The Book of Creation", rev.
 * ed., table 26). Recensions differ — the Short and Long versions permute
 * the faculties and tribe orderings — so this table is the project's frozen
 * source for the Phase 2c content keys.
 */
export const SEFER_YETZIRAH: Record<HebrewMonthKey, SeferYetzirahEntry> = {
  nisan: {
    month: "nisan",
    letter: "ה",
    letterName: "heh",
    tribe: "yehudah",
    tribeHebrew: "יהודה",
    faculty: "speech",
    facultyHebrew: "שיחה",
  },
  iyyar: {
    month: "iyyar",
    letter: "ו",
    letterName: "vav",
    tribe: "yissachar",
    tribeHebrew: "יששכר",
    faculty: "thought",
    facultyHebrew: "הרהור",
  },
  sivan: {
    month: "sivan",
    letter: "ז",
    letterName: "zayin",
    tribe: "zevulun",
    tribeHebrew: "זבולון",
    faculty: "motion",
    facultyHebrew: "הלוך",
  },
  tamuz: {
    month: "tamuz",
    letter: "ח",
    letterName: "chet",
    tribe: "reuven",
    tribeHebrew: "ראובן",
    faculty: "sight",
    facultyHebrew: "ראיה",
  },
  av: {
    month: "av",
    letter: "ט",
    letterName: "tet",
    tribe: "shimon",
    tribeHebrew: "שמעון",
    faculty: "hearing",
    facultyHebrew: "שמיעה",
  },
  elul: {
    month: "elul",
    letter: "י",
    letterName: "yod",
    tribe: "gad",
    tribeHebrew: "גד",
    faculty: "action",
    facultyHebrew: "מעשה",
  },
  tishrei: {
    month: "tishrei",
    letter: "ל",
    letterName: "lamed",
    tribe: "ephraim",
    tribeHebrew: "אפרים",
    faculty: "coition",
    facultyHebrew: "תשמיש",
  },
  cheshvan: {
    month: "cheshvan",
    letter: "נ",
    letterName: "nun",
    tribe: "menasheh",
    tribeHebrew: "מנשה",
    faculty: "smell",
    facultyHebrew: "ריח",
  },
  kislev: {
    month: "kislev",
    letter: "ס",
    letterName: "samekh",
    tribe: "binyamin",
    tribeHebrew: "בנימין",
    faculty: "sleep",
    facultyHebrew: "שינה",
  },
  tevet: {
    month: "tevet",
    letter: "ע",
    letterName: "ayin",
    tribe: "dan",
    tribeHebrew: "דן",
    faculty: "anger",
    facultyHebrew: "רוגז",
  },
  shvat: {
    month: "shvat",
    letter: "צ",
    letterName: "tsadi",
    tribe: "asher",
    tribeHebrew: "אשר",
    faculty: "taste",
    facultyHebrew: "לעיטה",
  },
  adar: {
    month: "adar",
    letter: "ק",
    letterName: "qof",
    tribe: "naphtali",
    tribeHebrew: "נפתלי",
    faculty: "laughter",
    facultyHebrew: "שחוק",
  },
};
