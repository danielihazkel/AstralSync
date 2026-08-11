import type { WheelChart } from "@/lib/view-types";
import { SIGN_NAMES } from "@/components/format";
import { SIGN_GLYPH_CHARS } from "@/components/chart/glyphs";
import UncertaintyBadge from "@/components/chart/UncertaintyBadge";
import styles from "./profile.module.css";

/** Sun, Moon, Rising — prominently, with Rising gracefully omitted on solar
 *  charts and uncertainty badges when the birth time is approximate. */
export default function BigThree({ chart }: { chart: WheelChart }) {
  const { sun, moon, ascendant } = chart.bigThree;
  const moonUncertainty = chart.uncertainties.find(
    (u) => u.field === "moon_sign",
  );
  const ascUncertainty = chart.uncertainties.find(
    (u) => u.field === "ascendant",
  );

  return (
    <section className={styles.bigThree} aria-label="Big Three">
      <div className={styles.bigThreeCard}>
        <span className={styles.bigThreeLabel}>Sun</span>
        <span className={styles.bigThreeSign}>
          <span className={styles.bigThreeGlyph} aria-hidden="true">
            {SIGN_GLYPH_CHARS[sun]}
          </span>
          {SIGN_NAMES[sun]}
        </span>
      </div>
      <div className={styles.bigThreeCard}>
        <span className={styles.bigThreeLabel}>Moon</span>
        <span className={styles.bigThreeSign}>
          <span className={styles.bigThreeGlyph} aria-hidden="true">
            {SIGN_GLYPH_CHARS[moon]}
          </span>
          {SIGN_NAMES[moon]}
          {moonUncertainty && (
            <UncertaintyBadge reason={moonUncertainty.reason} />
          )}
        </span>
      </div>
      <div className={styles.bigThreeCard}>
        <span className={styles.bigThreeLabel}>Rising</span>
        {ascendant ? (
          <span className={styles.bigThreeSign}>
            <span className={styles.bigThreeGlyph} aria-hidden="true">
              {SIGN_GLYPH_CHARS[ascendant]}
            </span>
            {SIGN_NAMES[ascendant]}
            {ascUncertainty && (
              <UncertaintyBadge reason={ascUncertainty.reason} />
            )}
          </span>
        ) : (
          <span className={styles.bigThreeSign}>
            —{" "}
            <span className={styles.bigThreeNote}>
              needs a birth time
            </span>
          </span>
        )}
      </div>
    </section>
  );
}
