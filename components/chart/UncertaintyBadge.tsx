import styles from "./chart.module.css";

/**
 * Amber badge marking a time-sensitive value as uncertain. The reason text
 * comes verbatim from the stored snapshot's `uncertainties` — the machine-
 * readable explanation the engine recorded at compute time.
 */
export default function UncertaintyBadge({ reason }: { reason: string }) {
  return (
    <span className={styles.uncertainBadge} title={reason} tabIndex={0}>
      <span aria-hidden="true">?</span>
      <span className={styles.srOnly}>Uncertain: {reason}</span>
    </span>
  );
}
