import Markdown from "@/components/Markdown";
import { moonPhaseKey } from "@/lib/contentKeys";
import type { EntryProse } from "@/lib/content";
import styles from "./moonPhaseProse.module.css";

/**
 * The current Moon phase's authored prose, folded under the phase name on
 * the Today strip and the almanac. Both compute the phase in the browser;
 * the server pages hand over all eight entries (a few KB) so the fold
 * works offline too.
 */
export default function MoonPhaseProse({
  phaseName,
  prose,
}: {
  phaseName: string;
  prose: Record<string, EntryProse>;
}) {
  const entry = prose[moonPhaseKey(phaseName)];
  if (!entry) return null;
  return (
    <details className={styles.more}>
      <summary>{entry.title}: what this phase favors</summary>
      <Markdown md={entry.bodyMd} />
    </details>
  );
}
