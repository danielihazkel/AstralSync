"use client";

import { useMemo, useState } from "react";
import type { CrossAspect, Planet } from "@astralsync/astro-core";
import type { SynastrySide } from "@/lib/synastry";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import { layoutBiWheel } from "@/components/chart/geometry";
import {
  ASPECT_COLOR,
  Glyph,
  PLANET_GLYPH_CHARS,
  SIGN_GLYPH_CHARS,
} from "@/components/chart/glyphs";
import SolarChartNotice from "@/components/chart/SolarChartNotice";
import chartStyles from "@/components/chart/chart.module.css";
import styles from "./synastry.module.css";
import SynastryDetail, { type SynastrySelection } from "./SynastryDetail";

function planetAriaLabel(side: SynastrySide, planet: Planet): string {
  const p = side.chart.placements.find((pl) => pl.planet === planet)!;
  const parts = [
    `${side.displayName}'s ${PLANET_NAMES[p.planet]}`,
    `${formatDegreeInSign(p.degreeInSign)} ${SIGN_NAMES[p.sign]}`,
  ];
  if (p.house !== null) parts.push(`house ${p.house}`);
  if (p.retrograde) parts.push("retrograde");
  if (p.planet === "moon" && side.moonUncertain) parts.push("sign uncertain");
  return parts.join(", ");
}

/**
 * The synastry bi-wheel: person A's chart inside (houses and all), person B's
 * planets on the outer band, dashed cross-aspect chords diving between rings.
 * Full hover/tap/focus parity with ChartWheel — hover previews, click/Enter
 * pins into the detail card — the interactivity the transit wheel deferred
 * to this phase.
 */
export default function BiWheel({
  a,
  b,
  aspects,
}: {
  a: SynastrySide;
  b: SynastrySide;
  aspects: CrossAspect[];
}) {
  const layout = useMemo(
    () =>
      layoutBiWheel(a.chart, {
        placements: b.chart.placements,
        crossAspects: aspects,
      }),
    [a.chart, b.chart, aspects],
  );
  const base = layout.base;
  const [pinned, setPinned] = useState<SynastrySelection>(null);
  const [hovered, setHovered] = useState<SynastrySelection>(null);
  const selection = hovered ?? pinned;

  function isPlanetActive(side: "a" | "b", planet: Planet): boolean {
    if (!selection) return true;
    if (selection.kind === "planet") {
      return selection.side === side && selection.planet === planet;
    }
    const c = aspects[selection.index];
    if (!c) return true;
    return side === "a" ? c.a === planet : c.b === planet;
  }

  function isAspectActive(index: number): boolean {
    if (!selection) return true;
    if (selection.kind === "aspect") return selection.index === index;
    const c = aspects[index];
    return (
      selection.kind === "planet" &&
      (selection.side === "a"
        ? c.a === selection.planet
        : c.b === selection.planet)
    );
  }

  function togglePin(next: Exclude<SynastrySelection, null>) {
    setPinned((cur) =>
      cur &&
      ((cur.kind === "planet" &&
        next.kind === "planet" &&
        cur.side === next.side &&
        cur.planet === next.planet) ||
        (cur.kind === "aspect" &&
          next.kind === "aspect" &&
          cur.index === next.index))
        ? null
        : next,
    );
  }

  function planetInteractivity(side: "a" | "b", planet: Planet) {
    return {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": planetAriaLabel(side === "a" ? a : b, planet),
      className: chartStyles.planet,
      opacity: isPlanetActive(side, planet) ? 1 : 0.35,
      onMouseEnter: () => setHovered({ kind: "planet", side, planet }),
      onMouseLeave: () => setHovered(null),
      onClick: () => togglePin({ kind: "planet", side, planet }),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          togglePin({ kind: "planet", side, planet });
        }
      },
    };
  }

  return (
    <div className={chartStyles.wheelWrap}>
      <div className={chartStyles.wheelColumn}>
        <svg
          viewBox={`0 0 ${layout.size} ${layout.size}`}
          className={chartStyles.wheel}
          role="img"
          aria-label={`Synastry bi-wheel: ${b.displayName}'s planets around ${a.displayName}'s chart`}
        >
          {/* Partner band boundary */}
          <circle
            cx={layout.center.x}
            cy={layout.center.y}
            r={layout.ringRadius}
            className={styles.partnerRing}
          />

          {/* Person A's wheel, shrunk and re-centered under the band */}
          <g transform={`translate(${layout.baseOffset} ${layout.baseOffset})`}>
            {base.signs.map((s, i) => (
              <path
                key={s.sign}
                d={s.path}
                className={
                  i % 2 === 0 ? chartStyles.signEven : chartStyles.signOdd
                }
              />
            ))}
            {base.signs.map((s) => (
              <g key={`label-${s.sign}`}>
                <title>{SIGN_NAMES[s.sign]}</title>
                <Glyph
                  char={SIGN_GLYPH_CHARS[s.sign]}
                  x={s.labelPoint.x}
                  y={s.labelPoint.y}
                  size={15}
                  fill="var(--accent)"
                />
              </g>
            ))}
            {base.houses?.map((h) => (
              <g key={h.house}>
                <line
                  x1={h.from.x}
                  y1={h.from.y}
                  x2={h.to.x}
                  y2={h.to.y}
                  className={chartStyles.cusp}
                />
                <text
                  x={h.labelPoint.x}
                  y={h.labelPoint.y}
                  className={chartStyles.houseNum}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {h.house}
                </text>
              </g>
            ))}
            <circle
              cx={base.center.x}
              cy={base.center.y}
              r={base.radii.hub}
              className={chartStyles.hubRing}
            />
            {/* A's ticks and glyphs (no natal aspect chords — the hub is
                reserved for cross-aspect endpoints, as on the transit wheel) */}
            {base.planets.map((p) => (
              <line
                key={`tick-${p.planet}`}
                x1={p.tickFrom.x}
                y1={p.tickFrom.y}
                x2={p.tickTo.x}
                y2={p.tickTo.y}
                className={chartStyles.tick}
              />
            ))}
            {base.planets.map((p) => (
              <g key={p.planet} {...planetInteractivity("a", p.planet)}>
                <circle
                  cx={p.glyphPoint.x}
                  cy={p.glyphPoint.y}
                  r={11}
                  className={chartStyles.planetHalo}
                />
                <Glyph
                  char={PLANET_GLYPH_CHARS[p.planet]}
                  x={p.glyphPoint.x}
                  y={p.glyphPoint.y}
                  size={15}
                />
                {p.retrograde && (
                  <text
                    x={p.glyphPoint.x + 9}
                    y={p.glyphPoint.y + 8}
                    className={chartStyles.retro}
                    aria-hidden="true"
                  >
                    ℞
                  </text>
                )}
                {p.planet === "moon" && a.moonUncertain && (
                  <circle
                    cx={p.glyphPoint.x + 9}
                    cy={p.glyphPoint.y - 8}
                    r={3}
                    className={chartStyles.uncertainDot}
                  />
                )}
              </g>
            ))}
          </g>

          {/* Cross-aspect chords: dashed, band inner edge (B) → hub (A) */}
          {layout.crossAspects.map((c, i) => (
            <g key={`${c.a}-${c.b}-${c.type}-${i}`}>
              <line
                x1={c.from.x}
                y1={c.from.y}
                x2={c.to.x}
                y2={c.to.y}
                stroke={ASPECT_COLOR[c.type]}
                strokeWidth={isAspectActive(i) ? 1.8 : 1.4}
                strokeDasharray="4 3"
                opacity={isAspectActive(i) ? 0.95 : 0.22}
              />
              {/* Wide invisible twin for hover/tap/focus */}
              <line
                x1={c.from.x}
                y1={c.from.y}
                x2={c.to.x}
                y2={c.to.y}
                stroke="transparent"
                strokeWidth={10}
                role="button"
                tabIndex={0}
                aria-label={`${a.displayName}'s ${PLANET_NAMES[c.a]} ${ASPECT_NAMES[c.type].toLowerCase()} ${b.displayName}'s ${PLANET_NAMES[c.b]}, orb ${c.orb.toFixed(1)} degrees`}
                className={chartStyles.hit}
                onMouseEnter={() => setHovered({ kind: "aspect", index: i })}
                onMouseLeave={() => setHovered(null)}
                onClick={() => togglePin({ kind: "aspect", index: i })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    togglePin({ kind: "aspect", index: i });
                  }
                }}
              />
            </g>
          ))}

          {/* Person B's glyphs in the outer band */}
          {layout.planets.map((p) => (
            <g
              key={`partner-${p.planet}`}
              {...planetInteractivity("b", p.planet)}
            >
              <line
                x1={p.tickFrom.x}
                y1={p.tickFrom.y}
                x2={p.tickTo.x}
                y2={p.tickTo.y}
                className={styles.partnerTick}
              />
              <circle
                cx={p.glyphPoint.x}
                cy={p.glyphPoint.y}
                r={11}
                className={styles.partnerHalo}
              />
              <Glyph
                char={PLANET_GLYPH_CHARS[p.planet]}
                x={p.glyphPoint.x}
                y={p.glyphPoint.y}
                size={15}
              />
              {p.retrograde && (
                <text
                  x={p.glyphPoint.x + 9}
                  y={p.glyphPoint.y + 8}
                  className={chartStyles.retro}
                  aria-hidden="true"
                >
                  ℞
                </text>
              )}
              {p.planet === "moon" && b.moonUncertain && (
                <circle
                  cx={p.glyphPoint.x + 9}
                  cy={p.glyphPoint.y - 8}
                  r={3}
                  className={chartStyles.uncertainDot}
                />
              )}
            </g>
          ))}
        </svg>

        <p className={styles.legend}>
          <span>
            <span className={styles.legendSwatchA} aria-hidden="true" />
            {a.displayName} (inner)
          </span>
          <span>
            <span className={styles.legendSwatchB} aria-hidden="true" />
            {b.displayName} (outer)
          </span>
        </p>

        {a.chart.houses?.fallbackApplied && (
          <p className={chartStyles.fallbackChip}>
            Whole Sign houses shown — Placidus is undefined at this latitude.
          </p>
        )}
        {a.isSolarChart && <SolarChartNotice chart={a.chart} />}
      </div>

      <SynastryDetail
        a={a}
        b={b}
        aspects={aspects}
        selection={selection}
        pinned={pinned}
      />
    </div>
  );
}
