"use client";

import { useMemo, useRef, useState } from "react";
import type { Planet } from "@astralsync/astro-core";
import type { TransitData } from "@/lib/transits";
import type { WheelChart } from "@/lib/view-types";

/** The slice of TransitData the wheel actually draws — progressions reuse
 *  the same two-ring layout with a different body label. */
export type RingBodies = Pick<TransitData, "placements" | "crossAspects">;
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import { layoutTransitWheel } from "@/components/chart/geometry";
import {
  ASPECT_COLOR,
  Glyph,
  PLANET_GLYPH_CHARS,
  SIGN_GLYPH_CHARS,
} from "@/components/chart/glyphs";
import chartStyles from "@/components/chart/chart.module.css";
import styles from "./transits.module.css";
import DownloadChartButton from "@/components/chart/DownloadChartButton";
import TransitDetail from "./TransitDetail";
import {
  isAspectActive,
  isPlanetActive,
  sameSelection,
  type TransitSelection,
} from "./transitSelection";

/**
 * The two-ring transit wheel: natal wheel inside, transiting (or progressed)
 * glyphs on an outer band, dashed cross-aspect chords diving between rings.
 * Full hover/tap/focus parity with the bi-wheel — hover previews, click or
 * Enter pins into the detail card. `<title>` tooltips stay for the SVG-export
 * path, and the cross-aspect list in the panel remains the accessible
 * reading surface.
 */
export default function TransitWheel({
  chart,
  transits,
  bodyLabel = "Transiting",
  downloadName = "transit wheel",
}: {
  chart: WheelChart;
  transits: RingBodies;
  /** Label for the outer-ring bodies ("Transiting" or "Progressed"). */
  bodyLabel?: string;
  /** Base name for the SVG/PNG download. */
  downloadName?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const layout = useMemo(
    () => layoutTransitWheel(chart, transits),
    [chart, transits],
  );
  const b = layout.base;
  const aspects = transits.crossAspects;
  const [pinned, setPinned] = useState<TransitSelection>(null);
  const [hovered, setHovered] = useState<TransitSelection>(null);
  const selection = hovered ?? pinned;

  function togglePin(next: Exclude<TransitSelection, null>) {
    setPinned((cur) => (cur && sameSelection(cur, next) ? null : next));
  }

  function planetAriaLabel(ring: "natal" | "outer", planet: Planet): string {
    const p = (ring === "outer" ? transits.placements : chart.placements).find(
      (pl) => pl.planet === planet,
    )!;
    const parts = [
      `${ring === "outer" ? bodyLabel : "Natal"} ${PLANET_NAMES[p.planet]}`,
      `${formatDegreeInSign(p.degreeInSign)} ${SIGN_NAMES[p.sign]}`,
    ];
    if (p.retrograde) parts.push("retrograde");
    return parts.join(", ");
  }

  function planetInteractivity(ring: "natal" | "outer", planet: Planet) {
    return {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": planetAriaLabel(ring, planet),
      className: chartStyles.planet,
      opacity: isPlanetActive(selection, aspects, ring, planet) ? 1 : 0.35,
      onMouseEnter: () => setHovered({ kind: "planet", ring, planet }),
      onMouseLeave: () => setHovered(null),
      onClick: () => togglePin({ kind: "planet", ring, planet }),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          togglePin({ kind: "planet", ring, planet });
        }
      },
    };
  }

  return (
    <div className={chartStyles.wheelWrap}>
      <div className={chartStyles.wheelColumn}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${layout.size} ${layout.size}`}
          className={chartStyles.wheel}
          role="img"
          aria-label={`${bodyLabel} planets around the natal chart`}
        >
          {/* Transit band boundary */}
          <circle
            cx={layout.center.x}
            cy={layout.center.y}
            r={layout.ringRadius}
            className={styles.transitRing}
          />

          {/* Natal wheel, shrunk and re-centered under the band */}
          <g transform={`translate(${layout.baseOffset} ${layout.baseOffset})`}>
            {b.signs.map((s, i) => (
              <path
                key={s.sign}
                d={s.path}
                className={
                  i % 2 === 0 ? chartStyles.signEven : chartStyles.signOdd
                }
              />
            ))}
            {b.signs.map((s) => (
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
            {b.houses?.map((h) => (
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
              cx={b.center.x}
              cy={b.center.y}
              r={b.radii.hub}
              className={chartStyles.hubRing}
            />
            {/* Natal planet ticks and glyphs (no natal aspect chords — the hub
                is reserved for cross-aspect endpoints so the rings stay legible) */}
            {b.planets.map((p) => (
              <line
                key={`tick-${p.planet}`}
                x1={p.tickFrom.x}
                y1={p.tickFrom.y}
                x2={p.tickTo.x}
                y2={p.tickTo.y}
                className={chartStyles.tick}
              />
            ))}
            {b.planets.map((p) => (
              <g key={p.planet} {...planetInteractivity("natal", p.planet)}>
                <title>{`Natal ${PLANET_NAMES[p.planet]}`}</title>
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
              </g>
            ))}
          </g>

          {/* Cross-aspect chords: dashed, band inner edge → natal hub */}
          {layout.crossAspects.map((c, i) => (
            <g key={`${c.a}-${c.b}-${c.type}-${i}`}>
              <line
                x1={c.from.x}
                y1={c.from.y}
                x2={c.to.x}
                y2={c.to.y}
                stroke={ASPECT_COLOR[c.type]}
                strokeWidth={isAspectActive(selection, aspects, i) ? 1.8 : 1.4}
                strokeDasharray="4 3"
                opacity={isAspectActive(selection, aspects, i) ? 0.95 : 0.22}
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
                aria-label={`${bodyLabel} ${PLANET_NAMES[c.a]} ${ASPECT_NAMES[c.type].toLowerCase()} natal ${PLANET_NAMES[c.b]}, orb ${c.orb.toFixed(1)} degrees`}
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

          {/* Transiting glyphs in the outer band */}
          {layout.planets.map((p) => {
            const placement = transits.placements.find(
              (t) => t.planet === p.planet,
            )!;
            return (
              <g
                key={`transit-${p.planet}`}
                {...planetInteractivity("outer", p.planet)}
              >
                <title>
                  {`${bodyLabel} ${PLANET_NAMES[p.planet]}, ${formatDegreeInSign(placement.degreeInSign)} ${SIGN_NAMES[placement.sign]}${placement.retrograde ? ", retrograde" : ""}`}
                </title>
                <line
                  x1={p.tickFrom.x}
                  y1={p.tickFrom.y}
                  x2={p.tickTo.x}
                  y2={p.tickTo.y}
                  className={styles.transitTick}
                />
                <circle
                  cx={p.glyphPoint.x}
                  cy={p.glyphPoint.y}
                  r={11}
                  className={styles.transitHalo}
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
              </g>
            );
          })}
        </svg>
        <DownloadChartButton svgRef={svgRef} baseName={downloadName} />
      </div>

      <TransitDetail
        chart={chart}
        transits={transits}
        aspects={aspects}
        selection={selection}
        pinned={pinned}
        bodyLabel={bodyLabel}
      />
    </div>
  );
}
