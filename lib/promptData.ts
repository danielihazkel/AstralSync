import { SIGNS } from "@astralsync/astro-core";
import type { NameNumberResult } from "@astralsync/numero-core";
import type {
  NumeroDerivation,
  StoredHebrewGematria,
  StoredMazal,
  WheelChart,
} from "./view-types";

/**
 * Compact human-readable renderings of the FULL stored data for the LLM
 * prompts in lib/llm.ts — every placement, aspect, house cusp, and
 * derivation step, in contrast to the curated subset the reading resolvers
 * interpret. Birth details (`input`: instant, coordinates) are deliberately
 * never rendered; names appear only through the name-number derivations.
 */

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

/** Mirrors components/format.ts formatDegreeInSign (lib stays UI-free). */
function degreeLabel(deg: number): string {
  let d = Math.floor(deg);
  let m = Math.round((deg - d) * 60);
  if (m === 60) {
    d += 1;
    m = 0;
  }
  return `${d}°${String(m).padStart(2, "0")}′`;
}

/** Ecliptic longitude → "Sign D°MM′". */
function zodiacPoint(longitude: number): string {
  const norm = ((longitude % 360) + 360) % 360;
  return `${cap(SIGNS[Math.floor(norm / 30)])} ${degreeLabel(norm % 30)}`;
}

/** "24 → 6" reduction chains; bare start value when already reduced. */
function chain(start: number, steps: number[]): string {
  return [start, ...steps].join(" → ");
}

function nameNumberLines(label: string, r: NameNumberResult): string[] {
  const variant = r.variant ? ` (${r.variant})` : "";
  const lines = [
    `${label}: ${r.value}${r.isMaster ? " (master number)" : ""} — ${r.system}${variant}`,
  ];
  for (const w of r.derivation.words) {
    const letters = w.letters.map((l) => `${l.char}=${l.value}`).join(" ");
    lines.push(`- ${w.word}: ${letters}; ${chain(w.subtotal, w.steps)}`);
  }
  lines.push(`- Total: ${chain(r.derivation.total, r.derivation.steps)}`);
  return lines;
}

/**
 * All placements, all aspects, and (non-solar) houses. Solar charts render
 * sign-only placements and no houses/orbs — positions are noon estimates,
 * matching the suppression in resolveReading.
 */
export function renderChartData(chart: WheelChart): string {
  const lines: string[] = [];

  lines.push(
    chart.isSolarChart
      ? "Placements (solar chart — noon estimates, signs only):"
      : "Placements:",
  );
  for (const p of chart.placements) {
    const retro = p.retrograde ? ", retrograde" : "";
    if (chart.isSolarChart) {
      lines.push(`- ${cap(p.planet)}: ${cap(p.sign)}${retro}`);
    } else {
      const house = p.house !== null ? `, ${ordinal(p.house)} house` : "";
      lines.push(
        `- ${cap(p.planet)}: ${cap(p.sign)} ${degreeLabel(p.degreeInSign)}${house}${retro}`,
      );
    }
  }

  if (!chart.isSolarChart && chart.houses !== null) {
    const h = chart.houses;
    lines.push(`Houses (${h.system}):`);
    lines.push(`- Ascendant (rising): ${zodiacPoint(h.ascendant)}`);
    lines.push(`- Midheaven (MC): ${zodiacPoint(h.mc)}`);
    h.cusps.forEach((cusp, i) => {
      lines.push(`- ${ordinal(i + 1)} house cusp: ${zodiacPoint(cusp)}`);
    });
  }

  if (chart.aspects.length > 0) {
    lines.push("Aspects (all):");
    for (const a of chart.aspects) {
      const orb = chart.isSolarChart ? "" : ` — orb ${degreeLabel(a.orb)}`;
      lines.push(`- ${cap(a.a)} ${a.type} ${cap(a.b)}${orb}`);
    }
  }

  if (chart.uncertainties.length > 0) {
    lines.push("Uncertainties:");
    for (const u of chart.uncertainties) lines.push(`- ${u.reason}`);
  }

  return lines.join("\n");
}

/**
 * Life Path, Destiny, Soul Urge, and Hebrew Destiny with their complete
 * derivations. Null/absent numbers (no name, pre-split snapshots) are
 * silently skipped.
 */
export function renderNumerologyData(numero: NumeroDerivation): string {
  const lp = numero.lifePath;
  const lines = [
    `Life Path: ${lp.value}${lp.isMaster ? " (master number)" : ""}`,
  ];
  for (const c of lp.derivation.components) {
    lines.push(`- ${cap(c.part)}: ${chain(c.raw, c.steps)}`);
  }
  lines.push(`- Total: ${chain(lp.derivation.total, lp.derivation.steps)}`);

  if (numero.destiny) {
    lines.push(...nameNumberLines("Destiny (Expression)", numero.destiny));
  }
  if (numero.soulUrge) {
    lines.push(...nameNumberLines("Soul Urge", numero.soulUrge));
  }
  if (numero.hebrewDestiny) {
    lines.push(...nameNumberLines("Hebrew Destiny", numero.hebrewDestiny));
  }
  return lines.join("\n");
}

/**
 * The full Mazal chart plus gematria: Hebrew date, month mazal, Sefer
 * Yetzirah correspondences, day planet, planetary hour (null on unknown
 * birth time / polar fallback), and both gematria derivations. English
 * labels with Hebrew terms carried through.
 */
export function renderMazalData(
  mazal: StoredMazal,
  gematria: StoredHebrewGematria,
): string {
  const lines: string[] = [];
  const eff = mazal.hebrewDate.effective;

  lines.push(
    `Hebrew date (sunset-adjusted): ${eff.day} ${eff.monthName} ${eff.year} (${eff.renderGematriya}), ${WEEKDAYS[eff.weekday]}`,
  );
  if (mazal.hebrewDate.afterSunset) {
    lines.push(
      "- Born after sunset: the Hebrew day had already begun, so the Hebrew date runs one day ahead of the civil date.",
    );
  }
  if (mazal.hebrewDate.ambiguity !== null) {
    lines.push(`- Date ambiguity: ${mazal.hebrewDate.ambiguity}`);
  }

  lines.push(
    `Mazal (month sign): ${eff.monthName} — ${cap(mazal.mazal.mazal)} (${cap(mazal.mazal.sign)}), Hebrew ${mazal.mazal.hebrew}`,
  );

  const sy = mazal.seferYetzirah;
  lines.push(
    `Sefer Yetzirah: letter ${sy.letter} (${sy.letterName}), tribe ${cap(sy.tribe)} (${sy.tribeHebrew}), faculty ${sy.faculty} (${sy.facultyHebrew})`,
  );

  const dp = mazal.dayPlanet;
  lines.push(
    `Day planet: ${WEEKDAYS[dp.weekday]} — ${cap(dp.planet)}${dp.ambiguous ? " (weekday uncertain)" : ""}`,
  );

  if (mazal.planetaryHour !== null) {
    const h = mazal.planetaryHour;
    lines.push(
      `Planetary hour: ${ordinal(h.hourIndex)} hour of the ${h.isDay ? "day" : "night"} — ${cap(h.planet)}; day ruler ${cap(h.dayRuler)}${h.uncertain ? " (approximate birth time — hour boundaries may shift)" : ""}`,
    );
  }

  const dg = gematria.dateGematria;
  lines.push(
    `Hebrew date gematria: ${dg.value}${dg.isMaster ? " (master number)" : ""}`,
  );
  for (const c of dg.derivation.components) {
    lines.push(`- ${cap(c.part)}: ${chain(c.raw, c.steps)}`);
  }
  lines.push(`- Total: ${chain(dg.derivation.total, dg.derivation.steps)}`);

  if (gematria.katanName !== null) {
    lines.push(
      ...nameNumberLines("Name gematria (mispar katan)", gematria.katanName),
    );
  }

  if (mazal.uncertainties.length > 0) {
    lines.push("Uncertainties:");
    for (const u of mazal.uncertainties) lines.push(`- ${u.reason}`);
  }

  return lines.join("\n");
}
