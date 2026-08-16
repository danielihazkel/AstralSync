import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_ORBS,
  PLANETS,
  detectAngleAspects,
  detectPatterns,
  partOfFortunePlacement,
  pointsAt,
  signOf,
  type AngleBody,
  type NodeVariant,
  type Planet,
  type PointName,
  type PointPlacement,
} from "@astralsync/astro-core";
import {
  natalAngleAspectKey,
  natalAspectKey,
  transitAspectKey,
} from "./contentKeys";
import type { WheelChart } from "./view-types";
import { CONTENT_VERSION } from "./versions";
import {
  elementDominance,
  modalityDominance,
  type ElementDominance,
  type ModalityDominance,
} from "./dominance";
import { synthesizeReading } from "./synthesis";

/**
 * Loader for the interpretation content library (PRD §5, ARCHITECTURE §7).
 * Server-only (reads `content/` from disk); the UI receives plain
 * `ResolvedReading` objects. Entries are Markdown files with a minimal flat
 * frontmatter — see content/README.md for the authoring guide.
 *
 * Note for a future standalone build (`output: "standalone"`, Phase 1g+):
 * `content/` is read at runtime from the project root and would need to be
 * added to `outputFileTracingIncludes` in next.config.ts.
 */

export const CONTENT_CATEGORIES = [
  "planet_in_sign",
  "planet_in_house",
  "aspect",
  // Natal planet-to-angle aspects (ASC/MC, majors only). These archetypes
  // also serve as the fallback prose for the transit and synastry angle
  // surfaces, mirroring the transit_aspect → aspect chain.
  "angle_aspect",
  "ascendant_sign",
  // The other angle: the MC's sign, resolved from houses (absent on solar
  // charts, exactly like the Ascendant).
  "mc_sign",
  // Whole-chart patterns (stellium, grand trine, …). Prose is per-type; the
  // specific planets ride in the section's source line.
  "chart_pattern",
  // Natal retrograde planets, Mercury–Pluto (luminaries never retrograde).
  "natal_retrograde",
  // Calculated points in sign: nodes, Lilith, Part of Fortune. Point-keyed
  // (not planet-keyed) on purpose — see astro-core/points.ts.
  "point_in_sign",
  // Synastry pair prose, Phase 3c — authoring is the optional 3d Tier 6;
  // the aspect list degrades to prose-less rows until entries land.
  "synastry_aspect",
  // Transit prose: transiting outer planets over natal points. Directional
  // keys (transiter first); unauthored pairs fall back to natal `aspect`
  // archetypes in the forecast prompt and transit list.
  "transit_aspect",
  // Transiting outer planets over the natal ASC/MC; unauthored keys fall
  // back to the natal `angle_aspect` archetypes in the transit list.
  "transit_angle_aspect",
  "element_dominance",
  "modality_dominance",
  "life_path",
  "destiny",
  "soul_urge",
  // Hebrew (Mazal) categories, Phase 2c — authored under content/he.
  "mazal_month",
  "day_planet",
  "hour_planet",
  "sefer_yetzirah",
  "hebrew_date_gematria",
  "name_gematria",
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export interface ContentEntry {
  /** Canonical id, e.g. "planet_in_sign/sun/aries" — always matches the path. */
  key: string;
  category: ContentCategory;
  title: string;
  /** Short clause consumed by template synthesis; required for
   *  element_dominance and life_path entries, optional elsewhere. */
  essence: string | null;
  bodyMd: string;
}

export interface ContentIndex {
  /** CONTENT_VERSION at load time. */
  version: string;
  entries: Map<string, ContentEntry>;
}

/**
 * Derive the canonical key from a root-relative file path: directories map
 * verbatim, and hyphens in the filename become key segments —
 * "planet_in_sign/sun-aries.md" → "planet_in_sign/sun/aries".
 */
export function keyFromPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/\.md$/, "");
  const slash = normalized.lastIndexOf("/");
  const dir = normalized.slice(0, slash + 1);
  const file = normalized.slice(slash + 1);
  return dir + file.replace(/-/g, "/");
}

/**
 * Parse an entry file: "---\nname: value\n…\n---\nbody". Flat string values
 * only — no nesting, quoting, or arrays. Throws (with the file path) on any
 * malformed input; the content lint test keeps the shipped tree parseable.
 */
export function parseEntryFile(raw: string, relPath: string): ContentEntry {
  const fail = (why: string): never => {
    throw new Error(`Malformed content entry ${relPath}: ${why}`);
  };

  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") fail("must start with a --- frontmatter fence");
  const end = lines.indexOf("---", 1);
  if (end === -1) fail("unterminated frontmatter");

  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) fail(`frontmatter line without a colon: "${line}"`);
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }

  const key = fields.get("key") ?? fail("missing key");
  const title = fields.get("title") ?? fail("missing title");
  const category = key.split("/")[0] as ContentCategory;
  if (!CONTENT_CATEGORIES.includes(category)) {
    fail(`unknown category "${category}"`);
  }
  const bodyMd = lines
    .slice(end + 1)
    .join("\n")
    .trim();
  if (bodyMd === "") fail("empty body");

  return { key, category, title, essence: fields.get("essence") ?? null, bodyMd };
}

export type ContentLocale = "en" | "he";

/** Text direction per locale — the UI sets `dir` from this, never guesses. */
export const LOCALE_DIRECTION: Record<ContentLocale, "ltr" | "rtl"> = {
  en: "ltr",
  he: "rtl",
};

/** Root of a locale's content tree. Keys are locale-free (content/README.md),
 *  so localization is a sibling tree with the same key taxonomy. */
export function contentRoot(locale: ContentLocale): string {
  return path.join(process.cwd(), "content", locale);
}

const DEFAULT_ROOT = contentRoot("en");

/** Process-lifetime cache per root — content is in-repo and immutable at
 *  runtime (restart the server to pick up edits). */
const indexCache = new Map<string, ContentIndex>();

function walkMarkdownFiles(root: string, dir = ""): string[] {
  const out: string[] = [];
  const abs = path.join(root, dir);
  for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = dir === "" ? d.name : `${dir}/${d.name}`;
    if (d.isDirectory()) out.push(...walkMarkdownFiles(root, rel));
    else if (d.name.endsWith(".md")) out.push(rel);
  }
  return out;
}

export function loadContentIndex(root: string = DEFAULT_ROOT): ContentIndex {
  const cached = indexCache.get(root);
  if (cached) return cached;

  const entries = new Map<string, ContentEntry>();
  for (const rel of walkMarkdownFiles(root)) {
    const entry = parseEntryFile(fs.readFileSync(path.join(root, rel), "utf8"), rel);
    const expected = keyFromPath(rel);
    if (entry.key !== expected) {
      throw new Error(
        `Content entry ${rel} declares key "${entry.key}" but its path implies "${expected}"`,
      );
    }
    entries.set(entry.key, entry);
  }

  const index: ContentIndex = { version: CONTENT_VERSION, entries };
  indexCache.set(root, index);
  return index;
}

export function getEntry(index: ContentIndex, key: string): ContentEntry | null {
  return index.entries.get(key) ?? null;
}

// Key builders live in lib/contentKeys.ts (client-safe — no fs); re-exported
// here so server-side callers keep a single import.
export { natalAngleAspectKey, natalAspectKey, transitAspectKey };

export type ReadingSlot =
  | "sun"
  | "moon"
  | "ascendant"
  | "mc"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto"
  | "element"
  | "modality"
  | "chart_pattern"
  | "aspect"
  | "angle"
  | "retrograde"
  | "house"
  | "point"
  | "life_path"
  | "destiny"
  | "soul_urge"
  | "synthesis";

export interface ReadingSection {
  slot: ReadingSlot;
  /** Canonical entry key, or null for the composed synthesis section. */
  key: string | null;
  title: string;
  bodyMd: string;
  /** Human-readable provenance, e.g. "Sun in Leo — 17°04′". */
  source: string;
  /** Set only on node sections when the mean and true nodes land in
   *  different signs: both variants are emitted, tagged, and the Reading
   *  panel shows the one matching the per-browser wheel pref. Untagged
   *  sections apply to every variant. */
  nodeVariant?: NodeVariant;
}

export interface NumeroReadingInput {
  lifePath: number;
  isMaster: boolean;
  /** Null when the profile has no birth name (or no vowels-only number). */
  destiny: { value: number; isMaster: boolean } | null;
  soulUrge: { value: number; isMaster: boolean } | null;
}

export interface ResolvedReading {
  /** Library version this reading was rendered with. */
  contentVersion: string;
  /** Library version the snapshot was computed under. */
  snapshotContentVersion: string;
  /** True when the two differ — the UI shows a provenance note. */
  stale: boolean;
  dominance: ElementDominance;
  modality: ModalityDominance;
  sections: ReadingSection[];
  /** Keys referenced but not authored — sections silently omitted. */
  missingKeys: string[];
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
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

/**
 * Resolve a snapshot pair to its reading: Big Three entries, the Midheaven,
 * element and modality dominance, chart patterns, the tightest natal
 * aspects, natal retrogrades, houses, calculated points, Life Path, and the
 * template synthesis. Missing entries are
 * collected in `missingKeys`, never thrown — the taxonomy is larger than
 * the authored library and degrades gracefully.
 */
export function resolveReading(
  chart: WheelChart,
  numero: NumeroReadingInput | null,
  snapshotContentVersion: string,
  index: ContentIndex = loadContentIndex(),
): ResolvedReading {
  const dominance = elementDominance(chart.placements);
  const modality = modalityDominance(chart.placements);
  const sections: ReadingSection[] = [];
  const missingKeys: string[] = [];

  const take = (
    key: string,
    slot: ReadingSlot,
    source: string,
    nodeVariant?: NodeVariant,
  ): ContentEntry | null => {
    const entry = getEntry(index, key);
    if (!entry) {
      missingKeys.push(key);
      return null;
    }
    sections.push({
      slot,
      key,
      title: entry.title,
      bodyMd: entry.bodyMd,
      source,
      ...(nodeVariant ? { nodeVariant } : {}),
    });
    return entry;
  };

  const planetSource = (planet: Planet): string => {
    const p = chart.placements.find((pl) => pl.planet === planet);
    const base = `${cap(planet)} in ${cap(p ? p.sign : "")}`;
    // Solar charts suppress degree precision (positions are noon estimates).
    return p && !chart.isSolarChart
      ? `${base} — ${degreeLabel(p.degreeInSign)}`
      : base;
  };

  take(`planet_in_sign/sun/${chart.bigThree.sun}`, "sun", planetSource("sun"));
  take(`planet_in_sign/moon/${chart.bigThree.moon}`, "moon", planetSource("moon"));

  if (chart.bigThree.ascendant !== null) {
    take(
      `ascendant_sign/${chart.bigThree.ascendant}`,
      "ascendant",
      `Rising in ${cap(chart.bigThree.ascendant)}`,
    );
  }

  // The other angle. Houses are null on a solar chart, so the key is never
  // attempted there — same silent skip as the Ascendant and house sections.
  if (chart.houses !== null) {
    const mcSign = signOf(chart.houses.mc);
    take(
      `mc_sign/${mcSign}`,
      "mc",
      `Midheaven in ${cap(mcSign)} — ${degreeLabel(chart.houses.mc % 30)}`,
    );
  }

  // Personal and social planets get their own sign sections; Jupiter and
  // Saturn move fast enough (1–2.5 years per sign) to stay individually
  // meaningful, so they sit with the placements.
  for (const planet of ["mercury", "venus", "mars", "jupiter", "saturn"] as const) {
    const p = chart.placements.find((pl) => pl.planet === planet);
    if (p) take(`planet_in_sign/${planet}/${p.sign}`, planet, planetSource(planet));
  }

  // The outer planets' signs are cohort-level (7–20+ years per sign) — the
  // UI groups these under a "Generational backdrop" heading.
  for (const planet of ["uranus", "neptune", "pluto"] as const) {
    const p = chart.placements.find((pl) => pl.planet === planet);
    if (p) take(`planet_in_sign/${planet}/${p.sign}`, planet, planetSource(planet));
  }

  const elementEntry = take(
    `element_dominance/${dominance.dominant}`,
    "element",
    `${dominance.counts[dominance.dominant]} of ${chart.placements.length} planets in ${dominance.dominant} signs`,
  );

  const modalityEntry = take(
    `modality_dominance/${modality.dominant}`,
    "modality",
    `${modality.counts[modality.dominant]} of ${chart.placements.length} planets in ${modality.dominant} signs`,
  );

  // Whole-chart patterns, recomputed from the stored placements the same way
  // the Chart tab does. Prose is per-type; the pattern's actual members ride
  // in the source line, so one entry serves every instance.
  for (const pattern of detectPatterns(chart.placements)) {
    const members = pattern.planets.map(cap).join(", ");
    const source =
      pattern.type === "stellium"
        ? `Stellium in ${cap(pattern.signs[0])} — ${members}`
        : pattern.apex
          ? `${members} — apex ${cap(pattern.apex)}`
          : members;
    take(`chart_pattern/${pattern.type}`, "chart_pattern", source);
  }

  // The chart's eight tightest aspects; unauthored pairs (the excluded
  // outer–outer combinations) degrade into missingKeys like everything else.
  const tightest = [...chart.aspects].sort((x, y) => x.orb - y.orb).slice(0, 8);
  for (const asp of tightest) {
    const base = `${cap(asp.a)} ${asp.type} ${cap(asp.b)}`;
    take(
      natalAspectKey(asp.a, asp.b, asp.type),
      "aspect",
      // Solar-chart positions are noon estimates — suppress orb precision.
      chart.isSolarChart ? base : `${base} — orb ${degreeLabel(asp.orb)}`,
    );
  }

  // Aspects to the chart angles, recomputed at read time exactly like the
  // patterns — angle aspects are never stored on the snapshot. Houses are
  // null on solar charts, so the section silently skips there (an angle
  // built from a noon estimate would mislead). Tightest four by orb.
  if (chart.houses !== null) {
    const angleLabel: Record<AngleBody, string> = {
      ascendant: "Ascendant",
      mc: "Midheaven",
    };
    const angles = detectAngleAspects(chart.placements, chart.houses, DEFAULT_ORBS)
      .sort((x, y) => x.orb - y.orb)
      .slice(0, 4);
    for (const asp of angles) {
      take(
        natalAngleAspectKey(asp.planet, asp.target, asp.type),
        "angle",
        `${cap(asp.planet)} ${asp.type} ${angleLabel[asp.target]} — orb ${degreeLabel(asp.orb)}`,
      );
    }
  }

  // Natal retrogrades — the luminaries never retrograde, and stations are so
  // slow that solar-chart noon estimates almost never flip the flag.
  for (const p of chart.placements) {
    if (p.retrograde && p.planet !== "sun" && p.planet !== "moon") {
      take(
        `natal_retrograde/${p.planet}`,
        "retrograde",
        `${cap(p.planet)} retrograde in ${cap(p.sign)}`,
      );
    }
  }

  // House placements for all ten planets, behind the per-placement
  // house-null guard — solar charts have no houses, so the keys are never
  // attempted (no missingKeys noise). Unlike signs, an outer planet's house
  // is personal (it depends on the birth time and place).
  for (const planet of PLANETS) {
    const p = chart.placements.find((pl) => pl.planet === planet);
    if (p && p.house !== null) {
      take(
        `planet_in_house/${planet}/${p.house}`,
        "house",
        `${cap(planet)} in the ${ordinal(p.house)} house`,
      );
    }
  }

  // Calculated points, recomputed from the stored instant like the Chart
  // tab's overlay. The wheel's mean/true node toggle is a per-browser pref
  // unavailable server-side, so when the two variants land in different
  // signs (a few weeks around each cusp crossing) the reading carries BOTH
  // node sections, tagged by variant — the panel shows the one matching the
  // browser pref, while server-only surfaces (print, the LLM prompt) keep
  // the true-node section. The Part of Fortune needs an Ascendant, so solar
  // charts list nodes and Lilith only.
  const POINT_LABELS: Record<PointName, string> = {
    north_node: "North Node",
    south_node: "South Node",
    lilith: "Lilith",
    part_of_fortune: "Part of Fortune",
  };
  const takePoint = (pt: PointPlacement, variant?: NodeVariant): void => {
    const base = `${POINT_LABELS[pt.point]} in ${cap(pt.sign)}`;
    // Solar charts suppress degree precision, like the planet sections.
    const source = chart.isSolarChart ? base : `${base} — ${degreeLabel(pt.degreeInSign)}`;
    take(
      `point_in_sign/${pt.point}/${pt.sign}`,
      "point",
      variant ? `${source} (${variant} node)` : source,
      variant,
    );
  };
  const instant = new Date(chart.input.utc);
  const meanPoints = pointsAt(instant, "mean");
  for (const pt of pointsAt(instant, "true")) {
    const mean =
      pt.point === "north_node" || pt.point === "south_node"
        ? meanPoints.find((m) => m.point === pt.point)
        : undefined;
    if (mean && mean.sign !== pt.sign) {
      takePoint(pt, "true");
      takePoint(mean, "mean");
    } else {
      takePoint(pt);
    }
  }
  if (chart.houses !== null) {
    const sun = chart.placements.find((p) => p.planet === "sun");
    const moon = chart.placements.find((p) => p.planet === "moon");
    if (sun && moon) {
      takePoint(
        partOfFortunePlacement(
          chart.houses.ascendant,
          sun.longitude,
          moon.longitude,
          chart.houses.cusps,
        ),
      );
    }
  }

  const lifePathEntry = numero
    ? take(
        `life_path/${numero.lifePath}`,
        "life_path",
        `Life Path ${numero.lifePath}${numero.isMaster ? " — master number" : ""}`,
      )
    : null;

  // Name numbers mirror the Life Path source format; a null field means the
  // profile has no birth name, so the section is omitted without noise.
  if (numero?.destiny) {
    take(
      `destiny/${numero.destiny.value}`,
      "destiny",
      `Destiny ${numero.destiny.value}${numero.destiny.isMaster ? " — master number" : ""}`,
    );
  }
  if (numero?.soulUrge) {
    take(
      `soul_urge/${numero.soulUrge.value}`,
      "soul_urge",
      `Soul Urge ${numero.soulUrge.value}${numero.soulUrge.isMaster ? " — master number" : ""}`,
    );
  }

  if (elementEntry) {
    sections.push({
      slot: "synthesis",
      key: null,
      title: "Putting it together",
      bodyMd: synthesizeReading({
        element: {
          name: dominance.dominant,
          title: elementEntry.title,
          essence: elementEntry.essence ?? "",
        },
        modality: modalityEntry
          ? {
              name: modality.dominant,
              title: modalityEntry.title,
              essence: modalityEntry.essence ?? "",
            }
          : null,
        lifePath:
          numero && lifePathEntry
            ? {
                value: numero.lifePath,
                isMaster: numero.isMaster,
                title: lifePathEntry.title,
                essence: lifePathEntry.essence ?? "",
              }
            : null,
      }),
      source: "Dominant element × modality × Life Path",
    });
  }

  return {
    contentVersion: index.version,
    snapshotContentVersion,
    stale: snapshotContentVersion !== index.version,
    dominance,
    modality,
    sections,
    missingKeys,
  };
}
