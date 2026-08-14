"use client";

import type { MoonDayCell, MoonMonth } from "@/lib/skyCalendar";
import { SIGN_NAMES } from "@/components/format";
import { SIGN_GLYPH_CHARS } from "@/components/chart/glyphs";
import styles from "./calendar.module.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function cellLabel(cell: MoonDayCell): string {
  const parts = [
    `${cell.date}: Moon in ${SIGN_NAMES[cell.signAtNoon]}`,
    `${Math.round(cell.illumination * 100)}% lit`,
  ];
  if (cell.quarter) parts.push(cell.quarter.name);
  if (cell.voc.length > 0) parts.push("void-of-course window");
  if (cell.eclipses.length > 0) parts.push("eclipse");
  return parts.join(", ");
}

export default function MoonMonthGrid({
  month,
  selected,
  onSelect,
}: {
  month: MoonMonth;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const firstWeekday = new Date(month.year, month.month - 1, 1).getDay();
  const todayKey = (() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();

  return (
    <div>
      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className={styles.grid} role="grid" aria-label="Moon calendar">
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}
        {month.days.map((cell) => (
          <button
            key={cell.date}
            type="button"
            className={[
              styles.cell,
              selected === cell.date ? styles.cellSelected : "",
              cell.date === todayKey ? styles.cellToday : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={cellLabel(cell)}
            aria-pressed={selected === cell.date}
            onClick={() => onSelect(cell.date)}
          >
            <span className={styles.dayNum}>{Number(cell.date.slice(8))}</span>
            <span>
              <span className={styles.glyph} aria-hidden="true">
                {SIGN_GLYPH_CHARS[cell.signAtNoon]}
              </span>{" "}
              {Math.round(cell.illumination * 100)}%
            </span>
            {cell.quarter && (
              <span className={styles.quarter}>{cell.quarter.name}</span>
            )}
            {cell.voc.length > 0 && <span className={styles.voc}>v/c</span>}
            {cell.eclipses.length > 0 && (
              <span className={styles.eclipse}>Eclipse</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
