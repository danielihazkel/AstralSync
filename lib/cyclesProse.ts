import { getEntry, loadContentIndex, type ContentIndex } from "./content";
import { natalAngleAspectKey, natalAspectKey } from "./contentKeys";
import type { CyclesData, CyclesEntryProse, CyclesProse } from "./cycles";

/**
 * Per-section prose for a cycles view from the content library: one fixed
 * slot per Cycles section, absent when the input is null (solar charts have
 * no profection or progressed Ascendant) or unauthored, plus the natal-pair
 * archetype for each contact row. Shared by /api/cycles (the Cycles tab)
 * and the year-ahead print report, so both say the same thing.
 */
export function resolveCyclesProse(
  view: CyclesData,
  index: ContentIndex = loadContentIndex(),
): CyclesProse {
  const resolve = (key: string): CyclesEntryProse | undefined => {
    const entry = getEntry(index, key);
    return entry ? { title: entry.title, bodyMd: entry.bodyMd } : undefined;
  };
  const prose: CyclesProse = {};
  if (view.profection) {
    prose.profection = resolve(`profection_year/${view.profection.profectedHouse}`);
  }
  const progressedSun = view.progressions.placements.find((p) => p.planet === "sun")?.sign;
  if (progressedSun) {
    prose.progressedSun = resolve(`progressed_sun_sign/${progressedSun}`);
  }
  const progressedAsc = view.progressions.chart.bigThree?.ascendant;
  if (progressedAsc) {
    prose.progressedAsc = resolve(`progressed_asc_sign/${progressedAsc}`);
  }
  if (view.firdaria) {
    prose.firdaria = resolve(`firdaria_lord/${view.firdaria.major.lord}`);
    const sub = view.firdaria.sub?.lord;
    if (sub && sub !== view.firdaria.major.lord) {
      prose.firdariaSub = resolve(`firdaria_lord/${sub}`);
    }
  }
  // Contact rows: the natal pair's archetype (same-planet contacts have no
  // natal pair entry and stay bare).
  const contacts: Record<string, CyclesEntryProse> = {};
  const addContact = (key: string) => {
    if (contacts[key]) return;
    const entry = resolve(key);
    if (entry) contacts[key] = entry;
  };
  for (const c of [
    ...view.progressions.crossAspects,
    ...view.tertiary.crossAspects,
    ...view.solarArc.crossAspects,
  ]) {
    if (c.a !== c.b) addContact(natalAspectKey(c.a, c.b, c.type));
  }
  for (const c of view.solarArc.angleAspects) {
    addContact(natalAngleAspectKey(c.planet, c.target, c.type));
  }
  prose.contacts = contacts;
  prose.solarArc = resolve("solar_arc/overview");
  prose.solarReturn = resolve("return_overview/solar");
  if (view.lunarReturn) prose.lunarReturn = resolve("return_overview/lunar");
  for (const r of view.planetaryReturns) {
    if (r.planet === "jupiter") prose.jupiterReturn = resolve("return_overview/jupiter");
    else if (r.planet === "saturn") prose.saturnReturn = resolve("return_overview/saturn");
  }
  return prose;
}
