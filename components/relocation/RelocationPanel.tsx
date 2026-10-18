"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PLANETS, type AcgAngle, type AcgLine, type Planet } from "@astralsync/astro-core";
import LazyChartWheel from "@/components/chart/LazyChartWheel";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import { PLANET_NAMES, SIGN_NAMES, ordinalHouse } from "@/components/format";
import CitySearch from "@/components/onboarding/CitySearch";
import type { LineNear, Relocated, RelocationPlace } from "@/lib/relocation";
import type { WheelChart } from "@/lib/view-types";
import styles from "./relocation.module.css";

const ANGLE_LABEL: Record<AcgAngle, string> = {
  mc: "MC",
  ic: "IC",
  asc: "ASC",
  dsc: "DSC",
};

const ANGLE_WORDS: Record<AcgAngle, string> = {
  mc: "culminating (on the MC)",
  ic: "anti-culminating (on the IC)",
  asc: "rising (on the Ascendant)",
  dsc: "setting (on the Descendant)",
};

/** Angle by dash pattern — the map's second encoding, so a line reads
 *  without its colour. */
const ANGLE_DASH: Record<AcgAngle, string | undefined> = {
  mc: undefined,
  ic: "6 4",
  asc: "2 3",
  dsc: "8 3 2 3",
};

/** The map frame: x = longitude + 180, y = 90 − latitude, 75°S–75°N. */
const MAX_LAT = 75;
const VIEWBOX = `0 ${90 - MAX_LAT} 360 ${2 * MAX_LAT}`;
const x = (lng: number) => lng + 180;
const y = (lat: number) => 90 - lat;

interface Computed {
  lines: AcgLine[];
  land: string;
  equatorial: Partial<Record<Planet, { ra: number; dec: number }>>;
  gst: number;
}

function parsePlace(params: URLSearchParams | ReturnType<typeof useSearchParams>): RelocationPlace | null {
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (params.get("lat") === null || params.get("lng") === null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { lat, lng, label: params.get("label") || `${lat.toFixed(2)}, ${lng.toFixed(2)}` };
}

/**
 * Astrocartography map and relocated chart. Lines are drawn in neutral ink
 * with the four angles told apart by dash pattern; one chosen planet is
 * picked out in the accent colour, so identity never rests on colour among
 * ten planets — every line also carries its planet's glyph. Pick a place by
 * city search (the accessible path) or by clicking the map; the place's
 * nearby lines and its relocated chart follow, and the place rides in the
 * URL.
 */
export default function RelocationPanel({
  profileId,
  chart,
}: {
  profileId: number;
  chart: WheelChart;
}) {
  const searchParams = useSearchParams();
  const [computed, setComputed] = useState<Computed | null>(null);
  const [highlight, setHighlight] = useState<Planet>("sun");
  const [place, setPlace] = useState<RelocationPlace | null>(() => parsePlace(searchParams));
  const [picking, setPicking] = useState(false);
  const [relocated, setRelocated] = useState<{ result: Relocated | null; near: LineNear[] } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [core, { WORLD_LAND_PATH }] = await Promise.all([
        import("@astralsync/astro-core"),
        import("@/lib/worldOutline"),
      ]);
      const utc = new Date(chart.input.utc);
      const p = core.astronomyEngineProvider;
      const equatorial = Object.fromEntries(
        core.PLANETS.map((planet) => [
          planet,
          { ra: p.rightAscension(planet, utc), dec: p.declination(planet, utc) },
        ]),
      );
      if (cancelled) return;
      setComputed({
        lines: core.astrocartographyLines(utc, { maxLatitude: MAX_LAT }),
        land: WORLD_LAND_PATH,
        equatorial,
        gst: p.siderealTimeDeg(utc),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [chart.input.utc]);

  useEffect(() => {
    if (place === null || computed === null) return;
    const params = new URLSearchParams({
      lat: place.lat.toFixed(4),
      lng: place.lng.toFixed(4),
      label: place.label,
    });
    window.history.replaceState(null, "", `?${params.toString()}`);
    let cancelled = false;
    void import("@/lib/relocation").then(({ relocateChart, linesNear }) => {
      if (cancelled) return;
      setRelocated({
        result: relocateChart(chart, place),
        near: linesNear(computed.lines, computed.equatorial, computed.gst, place),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [place, computed, chart]);

  const sorted = useMemo(
    () =>
      computed
        ? [...computed.lines].sort(
            (a, b) => Number(a.planet === highlight) - Number(b.planet === highlight),
          )
        : [],
    [computed, highlight],
  );

  function pickFromMap(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const lng = Math.max(-180, Math.min(180, pt.x - 180));
    const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, 90 - pt.y));
    setPlace({ lat, lng, label: `${lat.toFixed(2)}°, ${lng.toFixed(2)}°` });
  }

  return (
    <div className={styles.panel}>
      <p className={styles.muted}>
        Where on Earth each planet was on an angle at your birth — rising,
        setting, culminating or anti-culminating. Near a line, that planet
        comes to the fore; the recast chart below shows how.
      </p>

      <fieldset className={styles.chips}>
        <legend className={styles.muted}>Highlight</legend>
        {PLANETS.map((planet) => (
          <label key={planet} className={planet === highlight ? styles.chipActive : styles.chip}>
            <input
              type="radio"
              name="acg-highlight"
              checked={planet === highlight}
              onChange={() => setHighlight(planet)}
            />
            <span aria-hidden="true">{PLANET_GLYPH_CHARS[planet] + "︎"}</span>{" "}
            {PLANET_NAMES[planet]}
          </label>
        ))}
      </fieldset>

      {computed === null ? (
        <p className={styles.muted}>Drawing the lines…</p>
      ) : (
        <figure className={styles.figure}>
          <svg
            className={styles.map}
            viewBox={VIEWBOX}
            role="img"
            aria-label={`Astrocartography map with ${PLANET_NAMES[highlight]}'s lines highlighted${place ? `; ${place.label} marked` : ""}. Click to choose a place.`}
            onClick={pickFromMap}
          >
            <rect x={0} y={90 - MAX_LAT} width={360} height={2 * MAX_LAT} className={styles.sea} />
            <path d={computed.land} className={styles.land} />
            {[-60, -30, 0, 30, 60].map((lat) => (
              <line key={lat} x1={0} x2={360} y1={y(lat)} y2={y(lat)} className={styles.grid} />
            ))}
            {sorted.map((line) => {
              const on = line.planet === highlight;
              return (
                <g key={`${line.planet}-${line.angle}`} className={on ? styles.lineOn : styles.lineOff}>
                  <title>{`${PLANET_NAMES[line.planet]} ${ANGLE_WORDS[line.angle]}`}</title>
                  {line.segments.map((seg, i) => {
                    const d = seg.map(([lng, lat], j) => `${j ? "L" : "M"}${x(lng)} ${y(lat)}`).join("");
                    return (
                      <g key={i}>
                        <path d={d} className={styles.hit} />
                        <path d={d} strokeDasharray={ANGLE_DASH[line.angle]} />
                      </g>
                    );
                  })}
                  {(line.angle === "mc" || line.angle === "ic" || on) &&
                    line.segments[0] && (
                      <text
                        x={x(line.segments[0][line.segments[0].length - 1][0])}
                        y={y(line.segments[0][line.segments[0].length - 1][1]) + (line.angle === "ic" ? 9 : 5)}
                        className={styles.lineLabel}
                      >
                        {PLANET_GLYPH_CHARS[line.planet] + "︎"}
                        {on ? ` ${ANGLE_LABEL[line.angle]}` : ""}
                      </text>
                    )}
                </g>
              );
            })}
            {place && Math.abs(place.lat) <= MAX_LAT && (
              <g className={styles.marker}>
                <circle cx={x(place.lng)} cy={y(place.lat)} r={2.6} />
                <circle cx={x(place.lng)} cy={y(place.lat)} r={1.1} />
              </g>
            )}
          </svg>
          <figcaption className={styles.legend}>
            {(Object.keys(ANGLE_LABEL) as AcgAngle[]).map((angle) => (
              <span key={angle}>
                <svg width="28" height="8" aria-hidden="true">
                  <line x1="1" x2="27" y1="4" y2="4" strokeDasharray={ANGLE_DASH[angle]} className={styles.legendLine} />
                </svg>{" "}
                {ANGLE_LABEL[angle]}
              </span>
            ))}
            <span className={styles.muted}>
              Highlighted: {PLANET_NAMES[highlight]} · 75°S–75°N · lines drawn in mundo
            </span>
          </figcaption>
        </figure>
      )}

      <section className={styles.section} aria-labelledby="reloc-place">
        <h2 id="reloc-place" className={styles.sectionTitle}>
          {place ? place.label : "Choose a place"}
        </h2>
        {picking || place === null ? (
          <div className={styles.picker}>
            <CitySearch
              selected={null}
              onSelect={(city) => {
                setPlace({ label: city.label, lat: city.lat, lng: city.lng });
                setPicking(false);
              }}
              searchLabel="Search a place to relocate to"
              manualLabel="Can’t find it? Enter coordinates"
            />
            {place !== null && (
              <button type="button" className={styles.linkButton} onClick={() => setPicking(false)}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          <button type="button" className={styles.linkButton} onClick={() => setPicking(true)}>
            Choose another place
          </button>
        )}

        {place && relocated && (
          <>
            <h3 className={styles.subTitle}>Lines within 700 km</h3>
            {Math.abs(place.lat) > MAX_LAT && (
              <p className={styles.muted}>
                {place.label} lies beyond the map&rsquo;s {MAX_LAT}° edge, so it is not
                marked there; the distances below still hold.
              </p>
            )}
            {relocated.near.length === 0 ? (
              <p className={styles.muted}>No line passes within 700 km of here.</p>
            ) : (
              <div className="tableWrap">
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Line</th>
                      <th scope="col">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relocated.near.map((n) => (
                      <tr key={`${n.planet}-${n.angle}`}>
                        <td>
                          <span aria-hidden="true">{PLANET_GLYPH_CHARS[n.planet] + "︎"}</span>{" "}
                          {PLANET_NAMES[n.planet]} {ANGLE_LABEL[n.angle]}
                        </td>
                        <td>
                          {n.km < 10 ? "right here" : `${Math.round(n.km)} km ${n.side}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {relocated.result && (
              <>
                <h3 className={styles.subTitle}>The chart recast here</h3>
                <ul className={styles.facts}>
                  <li>
                    Ascendant {SIGN_NAMES[relocated.result.ascendant.natal]} →{" "}
                    <strong>{SIGN_NAMES[relocated.result.ascendant.here]}</strong>
                  </li>
                  <li>
                    Midheaven {SIGN_NAMES[relocated.result.mc.natal]} →{" "}
                    <strong>{SIGN_NAMES[relocated.result.mc.here]}</strong>
                  </li>
                  {relocated.result.angular.map((a) => (
                    <li key={`${a.planet}-${a.angle}`}>
                      {PLANET_NAMES[a.planet]} {ANGLE_WORDS[a.angle]} — within{" "}
                      {a.orb.toFixed(1)}°
                    </li>
                  ))}
                  {relocated.result.houseChanges.map((h) => (
                    <li key={h.planet}>
                      {PLANET_NAMES[h.planet]}: {ordinalHouse(h.natal)} house →{" "}
                      {ordinalHouse(h.here)}
                    </li>
                  ))}
                </ul>
                <LazyChartWheel
                  chart={relocated.result.chart}
                  downloadName={`relocated chart ${place.label}`}
                />
                <p className={styles.muted}>
                  The same birth instant cast for {place.label}: the planets
                  are where they were; the angles and houses are this
                  place&rsquo;s.{" "}
                  <a href={`/profiles/${profileId}?tab=cycles`}>
                    The Cycles tab can relocate the solar and lunar returns too.
                  </a>
                </p>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
