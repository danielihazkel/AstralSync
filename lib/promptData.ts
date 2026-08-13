import { SIGNS } from "@astralsync/astro-core";
import type { NameNumberResult } from "@astralsync/numero-core";
import {
  formatCivil,
  type ForecastPeriod,
  type HebrewPeriodSummary,
  type WesternPeriodSummary,
} from "./forecast";
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

function periodLabel(period: ForecastPeriod): string {
  if (period.kind === "day") return `day, ${formatCivil(period.start)}`;
  return `${period.kind}, ${formatCivil(period.start)} to ${formatCivil(period.end)}`;
}

/**
 * The period's sky for the western forecast prompts: start-of-period
 * positions, Moon sign spans, ingresses/stations (day-sampled, so dated
 * "around"), and the tracked transit-to-natal aspect windows. Current-period
 * dates only — the natal side comes from renderChartData, which never leaks
 * birth details.
 */
export function renderWesternPeriodData(summary: WesternPeriodSummary): string {
  const lines: string[] = [`Period: ${periodLabel(summary.period)}`];

  lines.push(
    summary.natal.isSolarChart
      ? "Transiting positions at the start of the period (noon; natal chart is solar — signs only):"
      : "Transiting positions at the start of the period (noon; house = natal house the transit falls in):",
  );
  for (const p of summary.startPlacements) {
    const retro = p.retrograde ? ", retrograde" : "";
    if (summary.natal.isSolarChart) {
      lines.push(`- ${cap(p.planet)}: ${cap(p.sign)}${retro}`);
    } else {
      const house = p.house !== null ? `, ${ordinal(p.house)} natal house` : "";
      lines.push(
        `- ${cap(p.planet)}: ${cap(p.sign)} ${degreeLabel(p.degreeInSign)}${house}${retro}`,
      );
    }
  }

  if (summary.moonBySign.length > 0) {
    lines.push("Moon by sign:");
    for (const span of summary.moonBySign) {
      const range =
        formatCivil(span.fromDate) === formatCivil(span.toDate)
          ? formatCivil(span.fromDate)
          : `${formatCivil(span.fromDate)} to ${formatCivil(span.toDate)}`;
      lines.push(`- Moon in ${cap(span.sign)}: ${range}`);
    }
  }
  if (summary.moonNext) {
    lines.push(
      `- The Moon moves into ${cap(summary.moonNext.sign)} by ${formatCivil(summary.moonNext.date)}.`,
    );
  }

  if (summary.events.length > 0) {
    lines.push("Sky events this period (dates approximate, from daily sampling):");
    for (const e of summary.events) {
      lines.push(
        e.type === "ingress"
          ? `- ${cap(e.planet)} enters ${cap(e.toSign)} (from ${cap(e.fromSign)}) around ${formatCivil(e.aroundDate)}`
          : `- ${cap(e.planet)} stations ${e.direction} around ${formatCivil(e.aroundDate)}`,
      );
    }
  }

  if (summary.topAspects.length > 0) {
    lines.push("Strongest transit aspects to the natal chart:");
    for (const w of summary.topAspects) {
      const hold = w.appliedAllPeriod ? ", in orb all period" : "";
      lines.push(
        `- Transiting ${cap(w.a)} ${w.type} natal ${cap(w.b)} — closest around ${formatCivil(w.closestDate)}, orb ${degreeLabel(w.minOrb)}${hold}`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * The period's Hebrew calendar for the hebrew forecast prompts: date range
 * under the daytime mapping, month mazal row(s), and per-day detail for
 * day/week periods (a month lists only its notable master-number days).
 * Location-free by construction — planetary hours never appear.
 */
export function renderHebrewPeriodData(summary: HebrewPeriodSummary): string {
  const first = summary.days[0];
  const last = summary.days[summary.days.length - 1];
  const lines: string[] = [
    `Period: ${periodLabel(summary.period)}`,
    `Hebrew dates (daytime mapping, no sunset adjustment): ${first.hebrew.day} ${first.hebrew.monthName} ${first.hebrew.year} to ${last.hebrew.day} ${last.hebrew.monthName} ${last.hebrew.year}`,
  ];

  for (const m of summary.months) {
    const sy = m.seferYetzirah;
    lines.push(
      `Month ${m.monthName} (civil ${formatCivil(m.fromCivil)} to ${formatCivil(m.toCivil)}): mazal ${cap(m.mazal.mazal)} (${cap(m.mazal.sign)}), Hebrew ${m.mazal.hebrew}; Sefer Yetzirah letter ${sy.letter} (${sy.letterName}), tribe ${cap(sy.tribe)} (${sy.tribeHebrew}), faculty ${sy.faculty} (${sy.facultyHebrew})`,
    );
  }
  if (summary.months.length > 1) {
    lines.push(
      `- A Hebrew month boundary falls inside this period: the mazal shifts from ${cap(summary.months[0].mazal.mazal)} to ${cap(summary.months[1].mazal.mazal)} on ${formatCivil(summary.months[1].fromCivil)}.`,
    );
  }

  if (summary.period.kind === "month") {
    lines.push(
      "Day planets cycle with the week: Sunday Sun, Monday Moon, Tuesday Mars, Wednesday Mercury, Thursday Jupiter, Friday Venus, Saturday Saturn.",
    );
    const notable = summary.days.filter((d) => d.dateGematria.isMaster);
    if (notable.length > 0) {
      lines.push("Master-number date gematria days:");
      for (const d of notable) {
        lines.push(
          `- ${formatCivil(d.civil)} (${d.hebrew.day} ${d.hebrew.monthName}): ${d.dateGematria.value}`,
        );
      }
    }
  } else {
    lines.push("Days:");
    for (const d of summary.days) {
      lines.push(
        `- ${WEEKDAYS[d.hebrew.weekday]} ${formatCivil(d.civil)} — ${d.hebrew.day} ${d.hebrew.monthName} ${d.hebrew.year} (${d.hebrew.renderGematriya}), day planet ${cap(d.dayPlanet)}, date gematria ${d.dateGematria.value}${d.dateGematria.isMaster ? " (master number)" : ""}`,
      );
    }
  }

  return lines.join("\n");
}
