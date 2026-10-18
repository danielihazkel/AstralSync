import type { JewishDay } from "@/lib/jewishMonth";
import styles from "./calendar.module.css";

/**
 * One civil day's Jewish calendar: its Hebrew date, then the day's holidays,
 * parasha and the like, and any candle-lighting, havdalah or fast times in
 * order. Times appear only with a home location (Settings) — candle-lighting
 * belongs to a place — and are given as hebcal words them, in that place's
 * own clock time ("Candle lighting: 18:32"), not the browser's zone.
 */
export default function JewishDayEvents({ day }: { day: JewishDay }) {
  const untimed = day.events.filter((e) => e.time === null);
  const timed = day.events
    .filter((e) => e.time !== null)
    .sort((a, b) => a.time!.localeCompare(b.time!));
  return (
    <section className={styles.jewishDay} aria-label="Jewish calendar">
      <p>
        <span lang="he" dir="rtl">
          {day.hebrewDay}
        </span>{" "}
        {day.monthName}
      </p>
      {day.events.length > 0 && (
        <ul className={styles.eventList}>
          {untimed.map((e) => (
            <li key={`${e.kind}-${e.title}`} className={e.major ? styles.yomTov : undefined}>
              {e.title}{" "}
              <span className={styles.muted} lang="he" dir="rtl">
                {e.titleHe}
              </span>
            </li>
          ))}
          {timed.map((e) => (
            <li key={`${e.kind}-${e.time}`}>{e.title}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
