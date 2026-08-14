"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Aspect,
  NodeVariant,
  Planet,
  PointPlacement,
} from "@astralsync/astro-core";
import type { WheelChart } from "@/lib/view-types";
import { loadChartSettings, saveChartSettings } from "@/lib/chartSettings";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  POINT_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import {
  layoutWheel,
  longitudeToScreenAngle,
  polarToXY,
  wheelRotation,
} from "./geometry";
import {
  ASPECT_COLOR,
  Glyph,
  PLANET_GLYPH_CHARS,
  POINT_GLYPH_CHARS,
  SIGN_GLYPH_CHARS,
} from "./glyphs";
import DownloadChartButton from "./DownloadChartButton";
import PlacementDetail, { type Selection } from "./PlacementDetail";
import SolarChartNotice from "./SolarChartNotice";
import styles from "./chart.module.css";

/** Points available per node variant, computed server-side from the stored
 *  UTC instant. Both variants ship so the toggle is instant and offline. */
export interface ChartPoints {
  mean: PointPlacement[];
  true: PointPlacement[];
}


function pointAriaLabel(p: PointPlacement): string {
  const parts = [
    POINT_NAMES[p.point],
    `${formatDegreeInSign(p.degreeInSign)} ${SIGN_NAMES[p.sign]}`,
  ];
  if (p.house !== null) parts.push(`house ${p.house}`);
  if (p.retrograde) parts.push("retrograde");
  return parts.join(", ");
}

function planetAriaLabel(chart: WheelChart, planet: Planet): string {
  const p = chart.placements.find((pl) => pl.planet === planet)!;
  const parts = [
    PLANET_NAMES[p.planet],
    `${formatDegreeInSign(p.degreeInSign)} ${SIGN_NAMES[p.sign]}`,
  ];
  if (p.house !== null) parts.push(`house ${p.house}`);
  if (p.retrograde) parts.push("retrograde");
  if (
    p.planet === "moon" &&
    chart.uncertainties.some((u) => u.field === "moon_sign")
  ) {
    parts.push("sign uncertain");
  }
  return parts.join(", ");
}

/**
 * The SVG natal wheel, rendered purely from stored snapshot JSON. Hover
 * previews a placement or aspect; click/tap/Enter pins it into the detail
 * card. Glyph positions are collision-adjusted; ticks and aspect chords stay
 * at the true longitudes.
 */
export default function ChartWheel({
  chart,
  points = null,
  minorAspects = null,
  downloadName = "chart",
}: {
  chart: WheelChart;
  points?: ChartPoints | null;
  /** Read-time minor-aspect overlay (never stored); computed server-side
   *  with fixed tight orbs. Null hides the toggle entirely. */
  minorAspects?: Aspect[] | null;
  downloadName?: string;
}) {
  // Preferences load after mount (localStorage is unavailable during SSR);
  // the pre-hydration frame renders the defaults.
  const [showPoints, setShowPoints] = useState(true);
  const [nodeVariant, setNodeVariant] = useState<NodeVariant>("true");
  const [showMinors, setShowMinors] = useState(false);
  useEffect(() => {
    const s = loadChartSettings();
    setShowPoints(s.showPoints);
    setNodeVariant(s.nodeVariant);
    setShowMinors(s.showMinorAspects);
  }, []);
  const activePoints = useMemo(
    () => (points && showPoints ? points[nodeVariant] : []),
    [points, showPoints, nodeVariant],
  );

  const layout = useMemo(
    () => layoutWheel(chart, undefined, activePoints),
    [chart, activePoints],
  );
  // Minor chords are decorative (non-interactive, outside the selection
  // model) — endpoints computed with the same rotation as the major chords.
  const minorChords = useMemo(() => {
    if (!minorAspects || !showMinors) return [];
    const rotation = wheelRotation(chart);
    const lonByPlanet = new Map(
      chart.placements.map((p) => [p.planet, p.longitude]),
    );
    const chordEnd = (planet: Planet) =>
      polarToXY(
        layout.center,
        layout.radii.hub,
        longitudeToScreenAngle(lonByPlanet.get(planet) ?? 0, rotation),
      );
    return minorAspects.map((a) => ({
      ...a,
      from: chordEnd(a.a),
      to: chordEnd(a.b),
    }));
  }, [minorAspects, showMinors, chart, layout]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pinned, setPinned] = useState<Selection>(null);
  const [hovered, setHovered] = useState<Selection>(null);
  const selection = hovered ?? pinned;

  const housesUncertain = chart.uncertainties.some(
    (u) => u.field === "houses" && !chart.houses?.fallbackApplied,
  );
  const moonUncertain = chart.uncertainties.some(
    (u) => u.field === "moon_sign",
  );
  const ascUncertain = chart.uncertainties.some(
    (u) => u.field === "ascendant",
  );

  function isPlanetActive(planet: Planet): boolean {
    if (!selection) return true;
    if (selection.kind === "planet") return selection.planet === planet;
    if (selection.kind === "point") return false;
    const a = chart.aspects[selection.index];
    return a ? a.a === planet || a.b === planet : true;
  }

  function isAspectActive(index: number): boolean {
    if (!selection) return true;
    if (selection.kind === "aspect") return selection.index === index;
    const a = chart.aspects[index];
    return (
      selection.kind === "planet" &&
      (a.a === selection.planet || a.b === selection.planet)
    );
  }

  function togglePin(next: Exclude<Selection, null>) {
    setPinned((cur) =>
      cur &&
      ((cur.kind === "planet" &&
        next.kind === "planet" &&
        cur.planet === next.planet) ||
        (cur.kind === "point" &&
          next.kind === "point" &&
          cur.point === next.point) ||
        (cur.kind === "aspect" &&
          next.kind === "aspect" &&
          cur.index === next.index))
        ? null
        : next,
    );
  }

  return (
    <div className={styles.wheelWrap}>
      <div className={styles.wheelColumn}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${layout.size} ${layout.size}`}
          className={styles.wheel}
          role="img"
          aria-label={
            chart.isSolarChart
              ? "Solar chart wheel (no houses — birth time unknown)"
              : "Natal chart wheel"
          }
        >
          {/* Sign ring */}
          {layout.signs.map((s, i) => (
            <path
              key={s.sign}
              d={s.path}
              className={i % 2 === 0 ? styles.signEven : styles.signOdd}
            />
          ))}
          {layout.signs.map((s) => (
            <g key={`label-${s.sign}`}>
              <title>{SIGN_NAMES[s.sign]}</title>
              <Glyph
                char={SIGN_GLYPH_CHARS[s.sign]}
                x={s.labelPoint.x}
                y={s.labelPoint.y}
                size={17}
                fill="var(--accent)"
              />
            </g>
          ))}

          {/* House cusps and numbers */}
          {layout.houses?.map((h) => (
            <g key={h.house}>
              <line
                x1={h.from.x}
                y1={h.from.y}
                x2={h.to.x}
                y2={h.to.y}
                className={styles.cusp}
              />
              <text
                x={h.labelPoint.x}
                y={h.labelPoint.y}
                className={
                  housesUncertain ? styles.houseNumUncertain : styles.houseNum
                }
                textAnchor="middle"
                dominantBaseline="central"
              >
                {h.house}
                {housesUncertain && <title>House placements uncertain</title>}
              </text>
            </g>
          ))}

          {/* Hub circle */}
          <circle
            cx={layout.center.x}
            cy={layout.center.y}
            r={layout.radii.hub}
            className={styles.hubRing}
          />

          {/* ASC / MC markers */}
          {layout.angles && (
            <g>
              <line
                x1={layout.angles.ascendantInner.x}
                y1={layout.angles.ascendantInner.y}
                x2={layout.angles.ascendant.x}
                y2={layout.angles.ascendant.y}
                className={styles.angleLine}
              />
              <text
                x={layout.angles.ascendant.x}
                y={layout.angles.ascendant.y}
                className={styles.angleLabel}
                textAnchor="middle"
                dominantBaseline="central"
              >
                ASC
                {ascUncertain && <title>Ascendant uncertain</title>}
              </text>
              {ascUncertain && (
                <circle
                  cx={layout.angles.ascendant.x + 14}
                  cy={layout.angles.ascendant.y - 6}
                  r={3}
                  className={styles.uncertainDot}
                />
              )}
              <line
                x1={layout.angles.mcInner.x}
                y1={layout.angles.mcInner.y}
                x2={layout.angles.mc.x}
                y2={layout.angles.mc.y}
                className={styles.angleLine}
              />
              <text
                x={layout.angles.mc.x}
                y={layout.angles.mc.y}
                className={styles.angleLabel}
                textAnchor="middle"
                dominantBaseline="central"
              >
                MC
              </text>
            </g>
          )}

          {/* Minor-aspect overlay: dashed, muted, non-interactive — drawn
              beneath the major chords so it never competes for the eye. */}
          {minorChords.map((a) => (
            <line
              key={`minor-${a.a}-${a.b}-${a.type}`}
              x1={a.from.x}
              y1={a.from.y}
              x2={a.to.x}
              y2={a.to.y}
              stroke={ASPECT_COLOR[a.type]}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={selection ? 0.12 : 0.55}
            >
              <title>
                {`${PLANET_NAMES[a.a]} ${ASPECT_NAMES[a.type].toLowerCase()} ${PLANET_NAMES[a.b]}, orb ${a.orb.toFixed(1)}°`}
              </title>
            </line>
          ))}

          {/* Aspect chords (drawn under planet glyphs) */}
          {layout.aspects.map((a, i) => (
            <g key={`${a.a}-${a.b}-${a.type}`}>
              <line
                x1={a.from.x}
                y1={a.from.y}
                x2={a.to.x}
                y2={a.to.y}
                stroke={ASPECT_COLOR[a.type]}
                strokeWidth={isAspectActive(i) ? 1.8 : 1}
                opacity={isAspectActive(i) ? 0.95 : 0.22}
              />
              {/* Wide invisible twin for hover/tap/focus */}
              <line
                x1={a.from.x}
                y1={a.from.y}
                x2={a.to.x}
                y2={a.to.y}
                stroke="transparent"
                strokeWidth={10}
                role="button"
                tabIndex={0}
                aria-label={`${PLANET_NAMES[a.a]} ${ASPECT_NAMES[a.type].toLowerCase()} ${PLANET_NAMES[a.b]}, orb ${a.orb.toFixed(1)} degrees`}
                className={styles.hit}
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

          {/* Point ticks and glyphs (nodes, Lilith) */}
          {layout.points.map((p) => {
            const placement = activePoints.find((ap) => ap.point === p.point)!;
            return (
              <g key={p.point}>
                <line
                  x1={p.tickFrom.x}
                  y1={p.tickFrom.y}
                  x2={p.tickTo.x}
                  y2={p.tickTo.y}
                  className={styles.tick}
                />
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={pointAriaLabel(placement)}
                  className={styles.planet}
                  opacity={
                    !selection ||
                    (selection.kind === "point" && selection.point === p.point)
                      ? 0.85
                      : 0.3
                  }
                  onMouseEnter={() =>
                    setHovered({ kind: "point", point: p.point })
                  }
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => togglePin({ kind: "point", point: p.point })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      togglePin({ kind: "point", point: p.point });
                    }
                  }}
                >
                  <circle
                    cx={p.glyphPoint.x}
                    cy={p.glyphPoint.y}
                    r={13}
                    className={styles.planetHalo}
                  />
                  <Glyph
                    char={POINT_GLYPH_CHARS[p.point]}
                    x={p.glyphPoint.x}
                    y={p.glyphPoint.y}
                    size={15}
                    fill="var(--text-muted)"
                  />
                  {p.retrograde && (
                    <text
                      x={p.glyphPoint.x + 10}
                      y={p.glyphPoint.y + 9}
                      className={styles.retro}
                      aria-hidden="true"
                    >
                      ℞
                    </text>
                  )}
                </g>
              </g>
            );
          })}

          {/* Planet ticks at true longitudes */}
          {layout.planets.map((p) => (
            <line
              key={`tick-${p.planet}`}
              x1={p.tickFrom.x}
              y1={p.tickFrom.y}
              x2={p.tickTo.x}
              y2={p.tickTo.y}
              className={styles.tick}
            />
          ))}

          {/* Planet glyphs (collision-adjusted positions) */}
          {layout.planets.map((p) => (
            <g
              key={p.planet}
              role="button"
              tabIndex={0}
              aria-label={planetAriaLabel(chart, p.planet)}
              className={styles.planet}
              opacity={isPlanetActive(p.planet) ? 1 : 0.35}
              onMouseEnter={() =>
                setHovered({ kind: "planet", planet: p.planet })
              }
              onMouseLeave={() => setHovered(null)}
              onClick={() => togglePin({ kind: "planet", planet: p.planet })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  togglePin({ kind: "planet", planet: p.planet });
                }
              }}
            >
              <circle
                cx={p.glyphPoint.x}
                cy={p.glyphPoint.y}
                r={13}
                className={styles.planetHalo}
              />
              <Glyph
                char={PLANET_GLYPH_CHARS[p.planet]}
                x={p.glyphPoint.x}
                y={p.glyphPoint.y}
                size={17}
              />
              {p.retrograde && (
                <text
                  x={p.glyphPoint.x + 10}
                  y={p.glyphPoint.y + 9}
                  className={styles.retro}
                  aria-hidden="true"
                >
                  ℞
                </text>
              )}
              {p.planet === "moon" && moonUncertain && (
                <circle
                  cx={p.glyphPoint.x + 10}
                  cy={p.glyphPoint.y - 9}
                  r={3}
                  className={styles.uncertainDot}
                />
              )}
            </g>
          ))}
        </svg>

        {(points || (minorAspects && minorAspects.length > 0)) && (
          <div className={styles.pointControls}>
            {points && (
            <label>
              <input
                type="checkbox"
                checked={showPoints}
                onChange={(e) => {
                  setShowPoints(e.target.checked);
                  saveChartSettings({
                    showPoints: e.target.checked,
                    nodeVariant,
                    showMinorAspects: showMinors,
                  });
                  if (!e.target.checked) {
                    setPinned((cur) => (cur?.kind === "point" ? null : cur));
                    setHovered((cur) => (cur?.kind === "point" ? null : cur));
                  }
                }}
              />{" "}
              Points (nodes, Lilith, Fortune)
            </label>
            )}
            {points && showPoints && (
              <label>
                Node:{" "}
                <select
                  value={nodeVariant}
                  onChange={(e) => {
                    const v = e.target.value as NodeVariant;
                    setNodeVariant(v);
                    saveChartSettings({
                      showPoints,
                      nodeVariant: v,
                      showMinorAspects: showMinors,
                    });
                  }}
                >
                  <option value="true">True</option>
                  <option value="mean">Mean</option>
                </select>
              </label>
            )}
            {minorAspects && minorAspects.length > 0 && (
              <label>
                <input
                  type="checkbox"
                  checked={showMinors}
                  onChange={(e) => {
                    setShowMinors(e.target.checked);
                    saveChartSettings({
                      showPoints,
                      nodeVariant,
                      showMinorAspects: e.target.checked,
                    });
                  }}
                />{" "}
                Minor aspects ({minorAspects.length})
              </label>
            )}
          </div>
        )}

        <DownloadChartButton svgRef={svgRef} baseName={downloadName} />

        {chart.houses?.fallbackApplied && (
          <p className={styles.fallbackChip}>
            Whole Sign houses shown — Placidus is undefined at this latitude.
          </p>
        )}
        {chart.isSolarChart && <SolarChartNotice chart={chart} />}
      </div>

      <PlacementDetail
        chart={chart}
        points={activePoints}
        selection={selection}
        pinned={pinned}
      />
    </div>
  );
}
