import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { signOf } from "@astralsync/astro-core";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  SIGN_NAMES,
  formatDegreeInSign,
} from "@/components/format";
import { listLifeEvents } from "@/lib/lifeEvents";
import {
  decisiveness,
  scoreCandidates,
  sensitivity,
  sweepCandidates,
  topCandidates,
  usableEventCount,
  type CandidateChart,
  type Hit,
  type Point,
  type SignSpan,
} from "@/lib/rectification";
import { getProfileName, getProfileView } from "@/lib/snapshots";
import styles from "./birthTime.module.css";

// Recomputed per request from the stored birth data and current events.
export const dynamic = "force-dynamic";

function parsePositiveInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const id = parsePositiveInt((await params).id);
  if (id === null) return {};
  const name = await getProfileName(id);
  return name ? { title: `${name} — birth time` } : {};
}

/** The windows on offer, in minutes either side ("day" = the whole day). */
const WINDOWS = [
  { key: "30", label: "±30 min", half: 30, step: 1 },
  { key: "120", label: "±2 hours", half: 120, step: 2 },
  { key: "360", label: "±6 hours", half: 360, step: 3 },
  { key: "day", label: "Whole day", half: null, step: 4 },
] as const;

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function pointName(p: Point): string {
  if (p === "ascendant") return "Ascendant";
  if (p === "mc") return "MC";
  return PLANET_NAMES[p];
}

function hitText(h: Hit): string {
  const aspect = ASPECT_NAMES[h.aspect].toLowerCase();
  const orb = `${h.orb.toFixed(2)}°`;
  switch (h.technique) {
    case "solar_arc":
      return `Solar-arc ${pointName(h.mover)} ${aspect} natal ${pointName(h.target)} (${orb})`;
    case "progressed":
      return `Progressed ${pointName(h.mover)} ${aspect} natal ${pointName(h.target)} (${orb})`;
    case "transit":
      return `Transiting ${pointName(h.mover)} ${aspect} the ${pointName(h.target)} (${orb})`;
  }
}

function SpanRow({
  label,
  spans,
  recorded,
}: {
  label: string;
  spans: SignSpan[];
  recorded: number | null;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>
        {spans.length === 1 ? (
          <>{SIGN_NAMES[spans[0].sign]} throughout</>
        ) : (
          spans.map((s, i) => {
            const holdsRecorded =
              recorded !== null && recorded >= s.fromMinutes && recorded <= s.toMinutes;
            return (
              <span key={`${s.sign}-${s.fromMinutes}`}>
                {i > 0 && " · "}
                <span className={holdsRecorded ? styles.recordedSpan : undefined}>
                  {SIGN_NAMES[s.sign]} {hhmm(s.fromMinutes)}–{hhmm(s.toMinutes)}
                </span>
              </span>
            );
          })
        )}
      </td>
    </tr>
  );
}

/** Scores across the window as a plain SVG bar chart, recorded time marked. */
function ScoreChart({
  scored,
  recorded,
  picks,
}: {
  scored: { minutes: number; score: number }[];
  recorded: number | null;
  picks: number[];
}) {
  const W = 640;
  const H = 120;
  const max = Math.max(...scored.map((s) => s.score), 1e-9);
  const first = scored[0].minutes;
  const span = Math.max(1, scored[scored.length - 1].minutes - first);
  const x = (m: number) => ((m - first) / span) * (W - 2) + 1;
  const barW = Math.max(1, (W - 2) / scored.length);
  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${W} ${H + 18}`}
      role="img"
      aria-label={`Scores for each candidate time from ${hhmm(first)} to ${hhmm(scored[scored.length - 1].minutes)}; the best are listed below.`}
    >
      {scored.map((s) => {
        const h = (s.score / max) * H;
        return (
          <rect
            key={s.minutes}
            x={x(s.minutes) - barW / 2}
            y={H - h}
            width={barW}
            height={h}
            className={picks.includes(s.minutes) ? styles.barPick : styles.bar}
          />
        );
      })}
      {recorded !== null && recorded >= first && recorded <= first + span && (
        <line x1={x(recorded)} x2={x(recorded)} y1={0} y2={H} className={styles.recordedLine} />
      )}
      <text x={1} y={H + 14} className={styles.axisLabel}>
        {hhmm(first)}
      </text>
      <text x={W - 1} y={H + 14} textAnchor="end" className={styles.axisLabel}>
        {hhmm(first + span)}
      </text>
    </svg>
  );
}

export default async function BirthTimePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const id = parsePositiveInt((await params).id);
  if (id === null) notFound();
  const view = await getProfileView(id);
  if (!view) notFound();
  const { profile } = view;

  const recorded =
    profile.birthTime === null
      ? null
      : Number(profile.birthTime.slice(0, 2)) * 60 + Number(profile.birthTime.slice(3, 5));

  // Default window by how much the time is trusted.
  const requested = (await searchParams).window;
  const fallback =
    profile.timeCertainty === "exact" ? "30" : profile.timeCertainty === "approx" ? "120" : "day";
  const win =
    WINDOWS.find((w) => w.key === requested && (w.half === null || recorded !== null)) ??
    WINDOWS.find((w) => w.key === fallback)!;
  const [from, to] =
    win.half === null || recorded === null
      ? [0, 24 * 60 - 1]
      : [recorded - win.half, recorded + win.half];

  const [year, month, day] = profile.birthDate.split("-").map(Number);
  const place = {
    birthDate: { year, month, day },
    tzIana: profile.tzIana,
    lat: profile.birthLat,
    lng: profile.birthLng,
    overrideOffsetMinutes: profile.offsetOverridden ? profile.utcOffsetMinutes : null,
  };
  const candidates = sweepCandidates(place, from, to, win.step);
  const sens = sensitivity(candidates);
  const byMinute = new Map<number, CandidateChart>(candidates.map((c) => [c.minutes, c]));

  const events = (await listLifeEvents(id)) ?? [];
  const usable = usableEventCount(events);
  const scored = usable >= 3 ? scoreCandidates(candidates, events, place) : [];
  const top = topCandidates(scored, 3, 20);
  const verdict = decisiveness(scored);
  const titleOf = new Map(events.map((e) => [e.id, e.title]));

  return (
    <main className={styles.page}>
      <p className={styles.muted}>
        <Link href={`/profiles/${id}`}>← {profile.displayName}</Link>
      </p>
      <h1>Birth time</h1>
      <p>
        Recorded:{" "}
        <strong>
          {profile.birthTime ?? "unknown"}
          {profile.timeCertainty === "approx" && " (approximate)"}
        </strong>
        . A birth time decides the Ascendant, the MC and the houses, and
        sometimes the Moon&rsquo;s sign; the rest of the chart is the same for
        every time that day.
      </p>

      <nav className={styles.windows} aria-label="Window">
        {WINDOWS.filter((w) => w.half === null || recorded !== null).map((w) =>
          w.key === win.key ? (
            <span key={w.key} className={styles.windowActive} aria-current="true">
              {w.label}
            </span>
          ) : (
            <Link key={w.key} href={`/profiles/${id}/birth-time?window=${w.key}`}>
              {w.label}
            </Link>
          ),
        )}
      </nav>

      <section className={styles.section} aria-labelledby="sensitivity">
        <h2 id="sensitivity">What changes from {hhmm(candidates[0].minutes)} to {hhmm(candidates[candidates.length - 1].minutes)}</h2>
        <div className="tableWrap">
          <table className={styles.table}>
            <tbody>
              <SpanRow label="Ascendant" spans={sens.ascendant} recorded={recorded} />
              <SpanRow label="MC" spans={sens.mc} recorded={recorded} />
              <SpanRow label="Moon" spans={sens.moon} recorded={recorded} />
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>
          The Ascendant moves about a degree every four minutes and the house
          cusps move with it, so a house placement within a few degrees of a
          cusp is only as certain as the minute of birth. The span holding the
          recorded time is highlighted.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="rectify">
        <h2 id="rectify">Testing times against your life events</h2>
        {usable < 3 ? (
          <p>
            This needs at least three life events dated to the day or the
            month — {usable === 0 ? "there are none yet" : `there ${usable === 1 ? "is one" : `are ${usable}`}`}.
            Year-only dates are too coarse to time an angle.{" "}
            <Link href={`/profiles/${id}?tab=life-events`}>Add life events</Link>.
          </p>
        ) : (
          <>
            <p>
              Each candidate time is scored by how tightly its angles were
              triggered when your {usable} dated events happened: solar-arc
              directions to and from the Ascendant and MC, the progressed
              angles, and slow transits over the angles — hard aspects only,
              weighted by how precisely each event is dated, with extra weight
              when the angle suits the event (career on the MC, partnership on
              the Ascendant–Descendant).
            </p>
            {scored.length > 0 && (
              <ScoreChart
                scored={scored}
                recorded={recorded}
                picks={top.map((t) => t.minutes)}
              />
            )}
            <p className={styles.verdict}>
              {verdict.verdict === "clear"
                ? `A clear standout: the best time scores ${verdict.ratio.toFixed(1)}× the window's typical time.`
                : verdict.verdict === "suggestive"
                  ? `Suggestive, not decisive: the best time scores ${verdict.ratio.toFixed(1)}× the window's typical time.`
                  : `Inconclusive: the best time scores only ${Number.isFinite(verdict.ratio) ? verdict.ratio.toFixed(1) : "—"}× the window's typical time, so many times fit about as well. More events dated to the day would sharpen it.`}
            </p>
            <ol className={styles.candidates}>
              {top.map((t) => {
                const c = byMinute.get(t.minutes)!;
                return (
                  <li key={t.minutes}>
                    <p>
                      <strong>{hhmm(t.minutes)}</strong>
                      {recorded !== null && t.minutes === recorded && " (the recorded time)"}{" "}
                      — Ascendant {formatDegreeInSign(c.ascendant % 30)}{" "}
                      {SIGN_NAMES[signOf(c.ascendant)]}, MC{" "}
                      {formatDegreeInSign(c.mc % 30)} {SIGN_NAMES[signOf(c.mc)]}
                      <span className={styles.muted}> · score {t.score.toFixed(1)}</span>
                    </p>
                    <details>
                      <summary>{t.hits.length} contacts</summary>
                      <ul className={styles.hits}>
                        {t.hits.map((h, i) => (
                          <li key={i}>
                            <span className={styles.eventTitle}>{titleOf.get(h.eventId)}</span>:{" "}
                            {hitText(h)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ol>
            <p className={styles.muted}>
              Rectification is an interpretive art, not a measurement: a
              handful of events can fit several times, and this never changes
              your profile. If a time convinces you,{" "}
              <Link href={`/profiles/${id}/edit`}>edit the birth time</Link>{" "}
              yourself — the chart keeps its earlier versions.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
