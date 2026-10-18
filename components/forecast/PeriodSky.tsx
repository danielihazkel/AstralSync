import type { Sign } from "@astralsync/astro-core";
import Markdown from "@/components/Markdown";
import { PLANET_GLYPH_CHARS, SIGN_GLYPH_CHARS } from "@/components/chart/glyphs";
import {
  ASPECT_NAMES,
  CLASSICAL_PLANET_LABELS,
  formatDegreeInSign,
  HEBREW_WEEKDAY_LABELS,
  ordinalHouse,
  PLANET_NAMES,
  SIGN_NAMES,
} from "@/components/format";
import type { CivilDate, TransitEvent } from "@/lib/forecast";
import type { ForecastSky } from "@/lib/forecastSky";
import styles from "./forecast.module.css";

/**
 * The computed half of a forecast card: the period summary the AI prompt is
 * built from, laid out for reading. Always shown — it is the whole forecast
 * on an install without a model, and the facts a generated forecast can be
 * checked against on one with.
 */

function day(d: CivilDate): string {
  return new Date(d.year, d.month - 1, d.day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function sameDay(a: CivilDate, b: CivilDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function span(from: CivilDate, to: CivilDate): string {
  return sameDay(from, to) ? day(from) : `${day(from)} – ${day(to)}`;
}

function SignLabel({ sign }: { sign: Sign }) {
  return (
    <>
      <span className={styles.glyph} aria-hidden="true">
        {SIGN_GLYPH_CHARS[sign]}
      </span>
      {SIGN_NAMES[sign]}
    </>
  );
}

const ECLIPSE_TYPE: Record<string, string> = {
  total: "Total",
  partial: "Partial",
  annular: "Annular",
  penumbral: "Penumbral",
};

function EventLine({ event }: { event: TransitEvent }) {
  switch (event.type) {
    case "ingress":
      return (
        <>
          <span className={styles.glyph} aria-hidden="true">
            {PLANET_GLYPH_CHARS[event.planet]}
          </span>
          {PLANET_NAMES[event.planet]} leaves {SIGN_NAMES[event.fromSign]} for{" "}
          <SignLabel sign={event.toSign} />{" "}
          <span className={styles.when}>around {day(event.aroundDate)}</span>
        </>
      );
    case "station":
      return (
        <>
          <span className={styles.glyph} aria-hidden="true">
            {PLANET_GLYPH_CHARS[event.planet]}
          </span>
          {PLANET_NAMES[event.planet]} stations {event.direction}{" "}
          <span className={styles.when}>around {day(event.aroundDate)}</span>
        </>
      );
    case "eclipse":
      return (
        <>
          {ECLIPSE_TYPE[event.eclipseType]} {event.kind} eclipse at{" "}
          {formatDegreeInSign(event.degreeInSign)} <SignLabel sign={event.sign} />{" "}
          <span className={styles.when}>on {day(event.date)}</span>
          {event.natalHouse !== null && (
            <> — in your {ordinalHouse(event.natalHouse)} house</>
          )}
          {event.natalContacts.length > 0 && (
            <>
              {"; "}
              {event.natalContacts
                .map(
                  (c) =>
                    `${c.aspect === "conjunction" ? "on" : "opposite"} your ${
                      PLANET_NAMES[c.planet]
                    } (${c.orb.toFixed(1)}°)`,
                )
                .join(", ")}
            </>
          )}
        </>
      );
  }
}

function WesternSky({ sky }: { sky: Extract<ForecastSky, { mode: "western" }> }) {
  const { summary, prose } = sky;
  const isDay = summary.period.kind === "day";
  return (
    <>
      <section className={styles.skySection} aria-label="The Moon">
        <h4 className={styles.skyHeading}>The Moon</h4>
        {isDay ? (
          <p>
            In <SignLabel sign={summary.moonBySign[0].sign} />
            {summary.moonNext && (
              <>
                , moving into <SignLabel sign={summary.moonNext.sign} /> by{" "}
                {day(summary.moonNext.date)}
              </>
            )}
            .
          </p>
        ) : (
          <ul className={styles.chips}>
            {summary.moonBySign.map((m) => (
              <li key={`${m.sign}-${m.fromDate.day}-${m.fromDate.month}`}>
                <SignLabel sign={m.sign} />{" "}
                <span className={styles.when}>{span(m.fromDate, m.toDate)}</span>
              </li>
            ))}
          </ul>
        )}
        {summary.natal.moonUncertain && (
          <p className={styles.muted}>
            Your natal Moon sign is uncertain, so contacts to it are approximate.
          </p>
        )}
      </section>

      {summary.events.length > 0 && (
        <section className={styles.skySection} aria-label="Sky events">
          <h4 className={styles.skyHeading}>Sky events</h4>
          <ul className={styles.skyList}>
            {summary.events.map((e, i) => (
              <li key={i}>
                <EventLine event={e} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.skySection} aria-label="Strongest contacts to your chart">
        <h4 className={styles.skyHeading}>Strongest contacts to your chart</h4>
        {summary.topAspects.length === 0 ? (
          <p className={styles.muted}>
            No transiting planet comes within orb of your natal planets in this
            period.
          </p>
        ) : (
          <ul className={styles.skyList}>
            {summary.topAspects.map((w, i) => {
              const text = prose[i];
              const label = (
                <>
                  <span className={styles.glyph} aria-hidden="true">
                    {PLANET_GLYPH_CHARS[w.a]}
                  </span>
                  {PLANET_NAMES[w.a]} {ASPECT_NAMES[w.type].toLowerCase()} natal{" "}
                  <span className={styles.glyph} aria-hidden="true">
                    {PLANET_GLYPH_CHARS[w.b]}
                  </span>
                  {PLANET_NAMES[w.b]}{" "}
                  <span className={styles.when}>
                    {w.appliedAllPeriod && !isDay
                      ? `in orb all ${summary.period.kind}, closest ${day(w.closestDate)}`
                      : `closest ${day(w.closestDate)}`}{" "}
                    ({w.minOrb.toFixed(1)}°)
                  </span>
                </>
              );
              return (
                <li key={`${w.a}-${w.b}-${w.type}`}>
                  {text ? (
                    <details className={styles.skyDetails}>
                      <summary>{label}</summary>
                      <div className={styles.body}>
                        <Markdown md={text.bodyMd} />
                      </div>
                    </details>
                  ) : (
                    label
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function HebrewSky({ sky }: { sky: Extract<ForecastSky, { mode: "hebrew" }> }) {
  const { summary } = sky;
  const isDay = summary.period.kind === "day";
  return (
    <>
      <section className={styles.skySection} aria-label="Hebrew month">
        <h4 className={styles.skyHeading}>
          {summary.months.length > 1 ? "Hebrew months" : "Hebrew month"}
        </h4>
        <ul className={styles.skyList}>
          {summary.months.map((m) => (
            <li key={`${m.monthName}-${m.fromCivil.month}-${m.fromCivil.day}`}>
              <strong>{m.monthName}</strong>
              {!isDay && (
                <span className={styles.when}> {span(m.fromCivil, m.toCivil)}</span>
              )}
              {" — mazal "}
              <span lang="he" dir="rtl">
                {m.mazal.hebrew}
              </span>{" "}
              (<SignLabel sign={m.mazal.sign as Sign} />) · letter{" "}
              <span lang="he" dir="rtl">
                {m.seferYetzirah.letter}
              </span>{" "}
              ({capitalize(m.seferYetzirah.letterName)}) · tribe of{" "}
              {capitalize(m.seferYetzirah.tribe)} · faculty of{" "}
              {m.seferYetzirah.faculty}
            </li>
          ))}
        </ul>
      </section>

      {isDay ? (
        <section className={styles.skySection} aria-label="The day">
          <h4 className={styles.skyHeading}>The day</h4>
          <p>
            <span lang="he" dir="rtl">
              {summary.days[0].hebrew.renderGematriya}
            </span>{" "}
            — {HEBREW_WEEKDAY_LABELS[summary.days[0].hebrew.weekday]}, ruled by{" "}
            {CLASSICAL_PLANET_LABELS[summary.days[0].dayPlanet]}; the date reduces
            to {summary.days[0].dateGematria.value}.
          </p>
        </section>
      ) : (
        <details className={styles.skyDetails} open={summary.period.kind === "week"}>
          <summary className={styles.skyHeading}>Day by day</summary>
          <div className="tableWrap">
            <table className={styles.dayTable}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Hebrew date</th>
                  <th scope="col">Day planet</th>
                  <th scope="col">Date number</th>
                </tr>
              </thead>
              <tbody>
                {summary.days.map((d) => (
                  <tr key={`${d.civil.month}-${d.civil.day}`}>
                    <td>{day(d.civil)}</td>
                    <td lang="he" dir="rtl">
                      {d.hebrew.renderGematriya}
                    </td>
                    <td>{CLASSICAL_PLANET_LABELS[d.dayPlanet]}</td>
                    <td>{d.dateGematria.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function PeriodSky({ sky }: { sky: ForecastSky }) {
  return (
    <div className={styles.sky}>
      {sky.mode === "western" ? <WesternSky sky={sky} /> : <HebrewSky sky={sky} />}
    </div>
  );
}
