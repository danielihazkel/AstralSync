import type { ChartPattern, PatternType } from "@astralsync/astro-core";
import { PLANET_NAMES, SIGN_NAMES } from "@/components/format";
import { PLANET_GLYPH_CHARS } from "./glyphs";
import styles from "./chart.module.css";

const PATTERN_LABELS: Record<PatternType, string> = {
  stellium: "Stellium",
  grand_trine: "Grand trine",
  t_square: "T-square",
  grand_cross: "Grand cross",
  yod: "Yod",
};

const PATTERN_COPY: Record<PatternType, string> = {
  stellium:
    "Three or more planets bundled in one sign — that sign's style runs through everything the group touches.",
  grand_trine:
    "Three planets in mutual trine, a closed circuit of ease — gifts that flow so naturally they can go unexamined.",
  t_square:
    "An opposition squared from a third planet — the apex takes the tension of both ends and becomes the chart's engine room.",
  grand_cross:
    "Two oppositions locked in four squares — pressure from every direction, and unusual capacity built by holding it.",
  yod:
    "Two quincunxes converging from a sextile onto one apex — an itch that keeps redirecting life toward a single point of adjustment.",
};

/**
 * Whole-chart aspect patterns under the wheel. Detection happens server-side
 * (detectPatterns) with fixed conventional orbs — 7° legs, 3° for yod
 * quincunxes — independent of the aspect list stored in the snapshot.
 */
export default function ChartPatterns({
  patterns,
}: {
  patterns: ChartPattern[];
}) {
  if (patterns.length === 0) return null;
  return (
    <section className={styles.patterns} aria-label="Chart patterns">
      <h3 className={styles.patternsTitle}>Chart patterns</h3>
      <ul className={styles.patternList}>
        {patterns.map((p, i) => (
          <li key={`${p.type}-${i}`}>
            <p className={styles.patternHead}>
              <strong>{PATTERN_LABELS[p.type]}</strong>
              {" — "}
              {p.planets.map((planet, j) => (
                <span key={planet}>
                  {j > 0 && ", "}
                  <span className={styles.patternGlyph} aria-hidden="true">
                    {PLANET_GLYPH_CHARS[planet] + "︎"}
                  </span>
                  {PLANET_NAMES[planet]}
                  {p.apex === planet && " (apex)"}
                </span>
              ))}
              {p.type === "stellium" && ` in ${SIGN_NAMES[p.signs[0]]}`}
            </p>
            <p className={styles.patternCopy}>{PATTERN_COPY[p.type]}</p>
          </li>
        ))}
      </ul>
      <p className={styles.patternNote}>
        Detected with standard orbs (7° legs, 3° yod quincunxes) — other
        software may draw the line differently.
      </p>
    </section>
  );
}
