import type { WheelChart } from "@/lib/view-types";
import styles from "./chart.module.css";

/**
 * Explains exactly what a solar chart suppresses and why, using the
 * machine-readable reasons the engine stored in the snapshot (PRD §3.1).
 */
export default function SolarChartNotice({ chart }: { chart: WheelChart }) {
  return (
    <div className={styles.solarNotice}>
      <h3>This is a solar chart</h3>
      <p>
        The birth time is unknown, so the chart shows planets in signs and the
        aspects between them — computed for local noon. Left out rather than
        guessed:
      </p>
      <ul>
        {chart.uncertainties.map((u) => (
          <li key={u.field + u.reason}>{u.reason}</li>
        ))}
      </ul>
    </div>
  );
}
