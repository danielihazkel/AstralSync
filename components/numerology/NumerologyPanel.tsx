"use client";

import Link from "next/link";
import type {
  LifePathResult,
  NameNumberResult,
} from "@astralsync/numero-core";
import type { NumeroView } from "@/lib/view-types";
import LifePathDerivation from "./LifePathDerivation";
import NameDerivation from "./NameDerivation";
import styles from "./numerology.module.css";

interface DerivationJson {
  lifePath: LifePathResult;
  destiny: NameNumberResult | null;
  soulUrge: NameNumberResult | null;
  /** Absent on snapshots computed before the two-field name split. */
  hebrewDestiny?: NameNumberResult | null;
}

/**
 * Numerology view with the full "show your work" derivation (PRD §3.3) —
 * rendered entirely from the stored `derivationJson` snapshot.
 */
export default function NumerologyPanel({
  numero,
  profileId,
}: {
  numero: NumeroView;
  profileId: number;
}) {
  const derivation = numero.derivation as unknown as DerivationJson;
  const isGematria = numero.system === "gematria";
  // Both-names case only: for Hebrew-only profiles the primary destiny IS
  // the gematria result, so a second card would be a duplicate.
  const hebrewDestiny = isGematria ? null : (derivation.hebrewDestiny ?? null);

  return (
    <div className={styles.panel}>
      <div className={styles.numberCards}>
        <div className={styles.numberCard}>
          <span className={styles.numberLabel}>Life Path</span>
          <span className={styles.numberValue}>
            {numero.lifePath}
            {numero.isMasterLifePath && (
              <span className={styles.masterBadge}>master number</span>
            )}
          </span>
        </div>
        {numero.destiny !== null && (
          <div className={styles.numberCard}>
            <span className={styles.numberLabel}>
              Destiny / Expression{isGematria && " (gematria)"}
            </span>
            <span className={styles.numberValue}>
              {numero.destiny}
              {derivation.destiny?.isMaster && (
                <span className={styles.masterBadge}>master number</span>
              )}
            </span>
          </div>
        )}
        {numero.soulUrge !== null && (
          <div className={styles.numberCard}>
            <span className={styles.numberLabel}>Soul Urge</span>
            <span className={styles.numberValue}>
              {numero.soulUrge}
              {derivation.soulUrge?.isMaster && (
                <span className={styles.masterBadge}>master number</span>
              )}
            </span>
          </div>
        )}
        {hebrewDestiny && (
          <div className={styles.numberCard}>
            <span className={styles.numberLabel}>Destiny (gematria)</span>
            <span className={styles.numberValue}>
              {hebrewDestiny.value}
              {hebrewDestiny.isMaster && (
                <span className={styles.masterBadge}>master number</span>
              )}
            </span>
          </div>
        )}
      </div>

      <LifePathDerivation result={derivation.lifePath} />

      {derivation.destiny && (
        <NameDerivation
          title={
            isGematria
              ? "Destiny — Hebrew gematria, letter by letter"
              : "Destiny / Expression — every letter"
          }
          result={derivation.destiny}
        />
      )}
      {derivation.soulUrge && (
        <NameDerivation
          title="Soul Urge — vowels only"
          result={derivation.soulUrge}
        />
      )}
      {hebrewDestiny && (
        <NameDerivation
          title="Destiny — Hebrew gematria, letter by letter"
          result={hebrewDestiny}
        />
      )}

      {(isGematria || hebrewDestiny) && (
        <p className={styles.note}>
          Soul Urge is not offered for Hebrew names: unvocalized Hebrew
          doesn&apos;t mark vowels, so a vowels-only number would be guesswork.
        </p>
      )}

      {derivation.destiny === null && (
        <p className={styles.note}>
          No birth name on this profile — the Life Path number comes from the
          birth date alone.{" "}
          <Link href={`/profiles/${profileId}/edit`}>
            Add the full birth name
          </Link>{" "}
          to unlock the Destiny and Soul Urge numbers.
        </p>
      )}
    </div>
  );
}
