import type { AngleAspect } from "@astralsync/astro-core";
import {
  ANGLE_NAMES,
  ASPECT_NAMES,
  PLANET_NAMES,
} from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
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
}: {
  /** Whose planets. */
  ownerName: string;
  /** Whose angles. */
  hostName: string;
  contacts: AngleAspect[];
}) {
  if (contacts.length === 0) return null;
  return (
    <div>
      <h4 className={styles.groupTitle}>
        {ownerName}&rsquo;s planets on {hostName}&rsquo;s angles
      </h4>
      <ul className={styles.aspectList}>
        {contacts.map((c, i) => (
          <li key={`${c.planet}-${c.target}-${c.type}-${i}`}>
            <span className={styles.glyph} aria-hidden="true">
              {PLANET_GLYPH_CHARS[c.planet] + "︎"}
            </span>
            {ownerName}&rsquo;s {PLANET_NAMES[c.planet]}{" "}
            {ASPECT_NAMES[c.type].toLowerCase()} {hostName}&rsquo;s{" "}
            {ANGLE_NAMES[c.target]}
            <span className={styles.orb}> orb {c.orb.toFixed(1)}°</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
