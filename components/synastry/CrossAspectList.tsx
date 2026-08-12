import { PLANETS, type CrossAspect, type Planet } from "@astralsync/astro-core";
import { synastryAspectKey } from "@/lib/synastry";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
} from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import UncertaintyBadge from "@/components/chart/UncertaintyBadge";
import Markdown from "@/components/Markdown";
import styles from "./synastry.module.css";

export interface AspectProse {
  title: string;
  bodyMd: string;
}

interface Group {
  /** Canonical unordered pair (PLANETS order) — Venus–Mars groups both
   *  A-Venus×B-Mars and A-Mars×B-Venus. */
  first: Planet;
  second: Planet;
  rows: { aspect: CrossAspect; index: number }[];
}

function groupByPair(aspects: CrossAspect[]): Group[] {
  const groups = new Map<string, Group>();
  aspects.forEach((aspect, index) => {
    const [first, second] =
      PLANETS.indexOf(aspect.a) <= PLANETS.indexOf(aspect.b)
        ? [aspect.a, aspect.b]
        : [aspect.b, aspect.a];
    const key = `${first}-${second}`;
    const group = groups.get(key) ?? { first, second, rows: [] };
    group.rows.push({ aspect, index });
    groups.set(key, group);
  });
  // Input is sorted by orb, so first-seen order = tightest-first per group.
  return [...groups.values()];
}

/** The accessible cross-aspect reading surface: sorted by orb, grouped by
 *  planet pair, with optional content-library prose per aspect (server
 *  rendered — entries light up as Tier 6 authoring lands). */
export default function CrossAspectList({
  aName,
  bName,
  aspects,
  aMoonReason,
  bMoonReason,
  prose,
}: {
  aName: string;
  bName: string;
  aspects: CrossAspect[];
  /** Uncertainty reason when that side's natal Moon sign is uncertain. */
  aMoonReason: string | null;
  bMoonReason: string | null;
  prose: Record<string, AspectProse>;
}) {
  if (aspects.length === 0) {
    return (
      <p className={styles.muted}>
        No cross aspects within orb (synastry uses natal orbs: 8° for the
        luminaries, 6° otherwise).
      </p>
    );
  }

  return (
    <ul className={styles.aspectGroups}>
      {groupByPair(aspects).map((group) => (
        <li key={`${group.first}-${group.second}`}>
          <h4 className={styles.groupTitle}>
            <span className={styles.glyph} aria-hidden="true">
              {PLANET_GLYPH_CHARS[group.first] + "︎"}
            </span>
            {PLANET_NAMES[group.first]} ×{" "}
            <span className={styles.glyph} aria-hidden="true">
              {PLANET_GLYPH_CHARS[group.second] + "︎"}
            </span>
            {PLANET_NAMES[group.second]}
          </h4>
          <ul className={styles.aspectList}>
            {group.rows.map(({ aspect: c, index }) => {
              const entry =
                prose[synastryAspectKey(c.a, c.b, c.type)];
              return (
                <li key={`${c.a}-${c.b}-${c.type}-${index}`}>
                  {aName}&rsquo;s {PLANET_NAMES[c.a]}{" "}
                  {ASPECT_NAMES[c.type].toLowerCase()} {bName}&rsquo;s{" "}
                  {PLANET_NAMES[c.b]}
                  <span className={styles.orb}> orb {c.orb.toFixed(1)}°</span>
                  {c.a === "moon" && aMoonReason && (
                    <UncertaintyBadge reason={aMoonReason} />
                  )}
                  {c.b === "moon" && bMoonReason && (
                    <UncertaintyBadge reason={bMoonReason} />
                  )}
                  {entry && (
                    <div className={styles.prose}>
                      <Markdown md={entry.bodyMd} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
