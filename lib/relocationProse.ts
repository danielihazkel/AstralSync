import { PLANETS, SIGNS, type AcgAngle, type Sign } from "@astralsync/astro-core";
import { getEntry, loadContentIndex, type ContentIndex } from "./content";
import { lineProseKey } from "./relocation";

export interface RelocationProseEntry {
  title: string;
  bodyMd: string;
}

/**
 * The prose the relocation page can show, resolved on the server (the
 * content index is server-only) and handed to the client panel whole: every
 * planet × line (40 `angle_aspect` archetypes) and the Ascendant and
 * Midheaven sign entries for whatever angles a chosen place produces. Absent
 * entries are simply absent — the house degradation.
 */
export interface RelocationProse {
  /** Keyed "<planet>-<angle>" ("venus-ic"); the body is the natal
   *  archetype at lineProseKey(planet, angle). */
  lines: Record<string, RelocationProseEntry>;
  ascendant: Partial<Record<Sign, RelocationProseEntry>>;
  mc: Partial<Record<Sign, RelocationProseEntry>>;
}

export function resolveRelocationProse(
  index: ContentIndex = loadContentIndex(),
): RelocationProse {
  const pick = (key: string) => {
    const e = getEntry(index, key);
    return e ? { title: e.title, bodyMd: e.bodyMd } : null;
  };
  const lines: RelocationProse["lines"] = {};
  for (const planet of PLANETS) {
    for (const angle of ["mc", "ic", "asc", "dsc"] as AcgAngle[]) {
      const entry = pick(lineProseKey(planet, angle));
      if (entry) lines[`${planet}-${angle}`] = entry;
    }
  }
  const ascendant: RelocationProse["ascendant"] = {};
  const mc: RelocationProse["mc"] = {};
  for (const sign of SIGNS) {
    const a = pick(`ascendant_sign/${sign}`);
    if (a) ascendant[sign] = a;
    const m = pick(`mc_sign/${sign}`);
    if (m) mc[sign] = m;
  }
  return { lines, ascendant, mc };
}
