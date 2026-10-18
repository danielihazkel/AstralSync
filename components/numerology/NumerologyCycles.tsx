import {
  ageOn,
  personalDay,
  personalMonth,
  personalYear,
  pinnacleAt,
  pinnacles,
  type CycleNumber,
} from "@astralsync/numero-core";
import Markdown from "@/components/Markdown";
import { todayLocalDate } from "@/components/atDate";
import type { NumeroProseEntry } from "./NumerologyPanel";
import styles from "./numerology.module.css";

/** Cycle prose resolved server-side, keyed by number. */
export interface CyclesProse {
  personalYear: Record<number, NumeroProseEntry>;
  pinnacle: Record<number, NumeroProseEntry>;
  challenge: Record<number, NumeroProseEntry>;
}

function Value({ n }: { n: CycleNumber }) {
  return (
    <span className={styles.numberValue}>
      {n.value}
      {n.isMaster && <span className={styles.masterBadge}>master number</span>}
    </span>
  );
}

/**
 * Numerology over time: where the birth date stands today — the personal
 * year, month and day, the next nine years, and the four pinnacles with
 * their challenges. All of it is calendar arithmetic over the birth date
 * (numero-core cycles.ts), computed in the browser for the browser's today;
 * only the prose comes from the server.
 */
export default function NumerologyCycles({
  birthDate,
  prose,
}: {
  /** Civil "YYYY-MM-DD". */
  birthDate: string;
  prose: CyclesProse;
}) {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const birth = { year: by, month: bm, day: bd };
  const [ty, tm, td] = todayLocalDate().split("-").map(Number);

  const year = personalYear(birth, ty);
  const month = personalMonth(birth, ty, tm);
  const day = personalDay(birth, ty, tm, td);
  const age = ageOn(birth, { year: ty, month: tm, day: td });
  const list = pinnacles(birth);
  const current = pinnacleAt(list, age);
  const nine = Array.from({ length: 9 }, (_, i) => ({
    year: ty + i,
    n: personalYear(birth, ty + i),
  }));

  const yearProse = prose.personalYear[year.value];
  const pinnacleProse = prose.pinnacle[current.number.value];
  const challengeProse = prose.challenge[current.challenge];

  return (
    <section className={styles.cycles} aria-labelledby="numerology-cycles">
      <h3 id="numerology-cycles" className={styles.cyclesHeading}>
        Your cycles now
      </h3>

      <div className={styles.numberCards}>
        <div className={styles.numberCard}>
          <span className={styles.numberLabel}>Personal year {ty}</span>
          <Value n={year} />
        </div>
        <div className={styles.numberCard}>
          <span className={styles.numberLabel}>Personal month</span>
          <Value n={month} />
        </div>
        <div className={styles.numberCard}>
          <span className={styles.numberLabel}>Personal day</span>
          <Value n={day} />
        </div>
      </div>

      {yearProse && (
        <div className={styles.derivation}>
          <h4>{yearProse.title}</h4>
          <Markdown md={yearProse.bodyMd} />
        </div>
      )}

      <div className={styles.derivation}>
        <h4>The next nine years</h4>
        <ol className={styles.yearStrip} aria-label="Personal years ahead">
          {nine.map(({ year: y, n }) => (
            <li key={y} aria-current={y === ty ? "true" : undefined}>
              <span className={styles.yearStripYear}>{y}</span>
              <span className={styles.yearStripValue}>{n.value}</span>
            </li>
          ))}
        </ol>
        <p className={styles.note}>
          Personal years run January to December: reduced birth month, plus
          reduced birth day, plus the reduced calendar year. The month adds
          the calendar month to the year; the day adds the date to the month.
        </p>
      </div>

      <div className={styles.derivation}>
        <h4>Pinnacles and challenges</h4>
        <div className="tableWrap">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Chapter</th>
                <th scope="col">Ages</th>
                <th scope="col">Years</th>
                <th scope="col">Pinnacle</th>
                <th scope="col">Challenge</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr
                  key={p.index}
                  className={p === current ? styles.currentRow : undefined}
                  aria-current={p === current ? "true" : undefined}
                >
                  <td>
                    {p.index}
                    {p === current && <span className={styles.nowTag}>now</span>}
                  </td>
                  <td>
                    {p.toAge === null ? `${p.fromAge}+` : `${p.fromAge}–${p.toAge}`}
                  </td>
                  <td>
                    {p.toAge === null
                      ? `${by + p.fromAge} on`
                      : `${by + p.fromAge}–${by + p.toAge}`}
                  </td>
                  <td>{p.number.value}</td>
                  <td>{p.challenge}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          Pinnacles add the reduced birth month, day and year in pairs; challenges
          subtract their root digits. The first chapter ends at 36 minus your
          Life Path&rsquo;s root digit, the next two last nine years each, and the
          fourth runs for the rest of life.
        </p>
      </div>

      {pinnacleProse && (
        <div className={styles.derivation}>
          <h4>
            Now: {pinnacleProse.title}, chapter {current.index} of 4
          </h4>
          <Markdown md={pinnacleProse.bodyMd} />
        </div>
      )}
      {challengeProse && (
        <div className={styles.derivation}>
          <h4>Alongside it: {challengeProse.title}</h4>
          <Markdown md={challengeProse.bodyMd} />
        </div>
      )}
    </section>
  );
}
