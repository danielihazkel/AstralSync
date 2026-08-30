import type { ChartStats as ChartStatsData } from "@/lib/chartStats";
import type { ChartShapeType } from "@/lib/chartStats";
import { PLANET_NAMES, SIGN_NAMES } from "@/components/format";
import { PLANET_GLYPH_CHARS } from "./glyphs";
import styles from "./chart.module.css";

const SHAPE_LABELS: Record<ChartShapeType, string> = {
  bundle: "Bundle",
  bowl: "Bowl",
  bucket: "Bucket",
  locomotive: "Locomotive",
  seesaw: "Seesaw",
  splay: "Splay",
  splash: "Splash",
};

const SHAPE_COPY: Record<ChartShapeType, string> = {
  bundle:
    "All ten planets within a third of the wheel — concentrated, specialised, self-contained.",
  bowl:
    "Everything in one half of the wheel — a life lived from one side, always aware of the empty half it faces.",
  bucket:
    "A bowl with one planet alone opposite — the handle channels the whole chart's energy into a single outlet.",
  locomotive:
    "Two-thirds occupied, one-third empty — driven, with the leading planet as the engine pulling the rest.",
  seesaw:
    "Two groups facing each other — a life of balancing acts, seeing both sides, weighing and re-weighing.",
  splay:
    "Three or more distinct clumps — strong individual interests that resist being organised into one line.",
  splash:
    "Spread around the whole wheel — wide-ranging, many-sided, at the risk of scattering.",
};

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function ordinal(house: number): string {
  const suffix =
    house === 1 ? "st" : house === 2 ? "nd" : house === 3 ? "rd" : "th";
  return `${house}${suffix}`;
}

function Glyph({ planet }: { planet: keyof typeof PLANET_GLYPH_CHARS }) {
  return (
    <span className={styles.patternGlyph} aria-hidden="true">
      {PLANET_GLYPH_CHARS[planet] + "︎"}
    </span>
  );
}

/**
 * Whole-chart statistics under the wheel: Jones shape, hemisphere
 * emphasis, missing/weak elements and modalities, the dispositor tree and
 * the house rulers. Computed server-side at read time (lib/chartStats.ts);
 * solar charts get the shape and balances only.
 */
export default function ChartStats({ stats }: { stats: ChartStatsData }) {
  const { shape, hemispheres, elements, modalities, dispositors, houseRulers } =
    stats;
  const lacks = [
    ...elements.missing.map((e) => `no ${e}`),
    ...elements.weak.map((e) => `only one planet in ${e}`),
    ...modalities.missing.map((m) => `no ${m}`),
    ...modalities.weak.map((m) => `only one ${m} planet`),
  ];

  return (
    <section className={styles.patterns} aria-label="Chart shape and balance">
      <h3 className={styles.patternsTitle}>Shape &amp; balance</h3>
      <ul className={styles.patternList}>
        <li>
          <p className={styles.patternHead}>
            <strong>{SHAPE_LABELS[shape.type]}</strong>
            {shape.type === "bucket" && shape.handle && (
              <>
                {" — handle "}
                <Glyph planet={shape.handle} />
                {PLANET_NAMES[shape.handle]}
              </>
            )}
            {(shape.type === "bowl" || shape.type === "locomotive") &&
              shape.leading && (
                <>
                  {" — led by "}
                  <Glyph planet={shape.leading} />
                  {PLANET_NAMES[shape.leading]}
                </>
              )}
            <span className={styles.orb}>
              {" "}
              (largest empty arc {Math.round(shape.largestGap)}°)
            </span>
          </p>
          <p className={styles.patternCopy}>{SHAPE_COPY[shape.type]}</p>
        </li>

        {hemispheres && (
          <li>
            <p className={styles.patternHead}>
              <strong>Hemispheres</strong>
              {" — "}
              {hemispheres.eastWest
                ? `${cap(hemispheres.eastWest)}ern (${hemispheres.eastWest === "east" ? hemispheres.east : hemispheres.west} of 10)`
                : "East and West balanced"}
              {" · "}
              {hemispheres.northSouth
                ? `${cap(hemispheres.northSouth)}ern (${hemispheres.northSouth === "north" ? hemispheres.north : hemispheres.south} of 10)`
                : "above and below the horizon balanced"}
            </p>
            <p className={styles.patternCopy}>
              East (houses 10–3) leans toward self-direction, West (4–9)
              toward what others bring; North (1–6, below the horizon) toward
              the private life, South (7–12) toward the public one.
            </p>
          </li>
        )}

        <li>
          <p className={styles.patternHead}>
            <strong>Balance</strong>
            {" — "}
            {lacks.length === 0
              ? "every element and modality has at least two planets"
              : lacks.join(", ")}
          </p>
          <p className={styles.patternCopy}>
            A missing element or mode is felt as a hunger — sought in others,
            in work, in place — as much as a lack.
          </p>
        </li>

        <li>
          <p className={styles.patternHead}>
            <strong>Dispositors</strong>
            {" — "}
            {dispositors.finalDispositor ? (
              <>
                final dispositor{" "}
                <Glyph planet={dispositors.finalDispositor} />
                {PLANET_NAMES[dispositors.finalDispositor]}
              </>
            ) : dispositors.inDomicile.length > 1 ? (
              <>
                no single final dispositor —{" "}
                {dispositors.inDomicile.map((p, i) => (
                  <span key={p}>
                    {i > 0 && ", "}
                    <Glyph planet={p} />
                    {PLANET_NAMES[p]}
                  </span>
                ))}{" "}
                each dispose their own chains
              </>
            ) : (
              "no final dispositor — the chains close in a loop"
            )}
            {dispositors.mutualReceptions.length > 0 && (
              <>
                {" · mutual reception: "}
                {dispositors.mutualReceptions.map(([a, b], i) => (
                  <span key={`${a}-${b}`}>
                    {i > 0 && ", "}
                    {PLANET_NAMES[a]} ⇄ {PLANET_NAMES[b]}
                  </span>
                ))}
              </>
            )}
          </p>
          <p className={styles.patternCopy}>
            Each planet is disposed by the traditional ruler of its sign; a
            chart that funnels to one planet in its own sign puts that planet
            in charge of the whole story.
          </p>
        </li>

        {houseRulers && (
          <li>
            <p className={styles.patternHead}>
              <strong>House rulers</strong>
            </p>
            <div className="tableWrap">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">House</th>
                    <th scope="col">Cusp</th>
                    <th scope="col">Ruler</th>
                    <th scope="col">Placed in</th>
                  </tr>
                </thead>
                <tbody>
                  {houseRulers.map((r) => (
                    <tr key={r.house}>
                      <td>{ordinal(r.house)}</td>
                      <td>{SIGN_NAMES[r.cuspSign]}</td>
                      <td>
                        <Glyph planet={r.ruler} />
                        {PLANET_NAMES[r.ruler]}
                        {r.modernRuler && (
                          <span className={styles.orb}>
                            {" "}
                            (modern {PLANET_NAMES[r.modernRuler]})
                          </span>
                        )}
                      </td>
                      <td>
                        {ordinal(r.rulerHouse)} house, {SIGN_NAMES[r.rulerSign]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.patternCopy}>
              Where a house&rsquo;s ruler sits tells where that house&rsquo;s
              affairs get worked out — the 7th ruler in the 10th brings
              partnership into career, and so on.
            </p>
          </li>
        )}
      </ul>
      <p className={styles.patternNote}>
        Shape by Jones&rsquo;s conventional rules (60° group gaps, 120°/180°/
        240° thresholds); rulerships traditional, modern co-rulers noted.
      </p>
    </section>
  );
}
