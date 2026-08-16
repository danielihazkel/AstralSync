import type { AngleAspect } from "@astralsync/astro-core";
import { synastryAngleAspectKey } from "@/lib/contentKeys";
import {
  ANGLE_NAMES,
  ASPECT_NAMES,
  PLANET_NAMES,
} from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import Markdown from "@/components/Markdown";
import styles from "./synastry.module.css";

/**
 * Planet-to-angle contacts, one direction per list ("A's Venus conjunction
 * B's Ascendant"). Server rendered beside CrossAspectList; the host section
 * renders nothing when both directions are empty.
 */
export default function AngleContactList({
  ownerName,
  hostName,
  contacts,
  prose,
}: {
  /** Whose planets. */
  ownerName: string;
  /** Whose angles. */
  hostName: string;
  contacts: AngleAspect[];
  /** Per-contact prose keyed by synastryAngleAspectKey — body rendered
   *  under the row, like CrossAspectList. Absent keys render nothing. */
  prose?: Record<string, { title: string; bodyMd: string }>;
}) {
  if (contacts.length === 0) return null;
  return (
    <div>
      <h4 className={styles.groupTitle}>
        {ownerName}&rsquo;s planets on {hostName}&rsquo;s angles
      </h4>
      <ul className={styles.aspectList}>
        {contacts.map((c, i) => {
          const entry = prose?.[synastryAngleAspectKey(c.planet, c.target, c.type)];
          return (
            <li key={`${c.planet}-${c.target}-${c.type}-${i}`}>
              <span className={styles.glyph} aria-hidden="true">
                {PLANET_GLYPH_CHARS[c.planet] + "︎"}
              </span>
              {ownerName}&rsquo;s {PLANET_NAMES[c.planet]}{" "}
              {ASPECT_NAMES[c.type].toLowerCase()} {hostName}&rsquo;s{" "}
              {ANGLE_NAMES[c.target]}
              <span className={styles.orb}> orb {c.orb.toFixed(1)}°</span>
              {entry && (
                <div className={styles.prose}>
                  <Markdown md={entry.bodyMd} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
