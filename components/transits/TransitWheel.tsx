"use client";

import { useMemo } from "react";
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

/**
 * The two-ring transit wheel: natal wheel inside, transiting glyphs on an
 * outer band, dashed cross-aspect chords diving between rings. Static-first —
 * `<title>` tooltips carry the detail; the accessible cross-aspect list in
 * TransitsPanel is the primary reading surface. (Hover/pin parity arrives
 * with the Phase 3c bi-wheel.)
 */
export default function TransitWheel({
  chart,
  transits,
  bodyLabel = "Transiting",
}: {
  chart: WheelChart;
  transits: RingBodies;
  /** Label for the outer-ring bodies ("Transiting" or "Progressed"). */
  bodyLabel?: string;
}) {
  const layout = useMemo(
    () => layoutTransitWheel(chart, transits),
    [chart, transits],
  );
  const b = layout.base;

  return (
    <svg
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
          <g key={p.planet}>
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
          <title>
            {`${bodyLabel} ${PLANET_NAMES[c.a]} ${ASPECT_NAMES[c.type].toLowerCase()} natal ${PLANET_NAMES[c.b]}, orb ${c.orb.toFixed(1)}°`}
          </title>
          <line
            x1={c.from.x}
            y1={c.from.y}
            x2={c.to.x}
            y2={c.to.y}
            stroke={ASPECT_COLOR[c.type]}
            strokeWidth={1.4}
            strokeDasharray="4 3"
            opacity={0.8}
          />
        </g>
      ))}

      {/* Transiting glyphs in the outer band */}
      {layout.planets.map((p) => {
        const placement = transits.placements.find(
          (t) => t.planet === p.planet,
        )!;
        return (
          <g key={`transit-${p.planet}`}>
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
  );
}
