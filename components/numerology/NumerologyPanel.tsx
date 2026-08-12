"use client";

import Link from "next/link";
import type { NumeroView } from "@/lib/view-types";
import { toNumeroDerivation } from "@/lib/view-types";
import Markdown from "@/components/Markdown";
import LifePathDerivation from "./LifePathDerivation";
import NameDerivation from "./NameDerivation";
import styles from "./numerology.module.css";

export interface NumeroProseEntry {
  title: string;
  bodyMd: string;
}

/** Interpretation prose resolved server-side (the content loader reads disk). */
export interface NumeroProse {
  destiny: NumeroProseEntry | null;
  soulUrge: NumeroProseEntry | null;
}

/**
 * Numerology view with the full "show your work" derivation (PRD §3.3) —
 * rendered entirely from the stored `derivationJson` snapshot.
 */
export default function NumerologyPanel({
  numero,
  prose,
  profileId,
}: {
  numero: NumeroView;
  prose: NumeroProse;
  profileId: number;
}) {
  const derivation = toNumeroDerivation(numero);
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

      {prose.destiny && (
        <section className={styles.derivation} aria-label={prose.destiny.title}>
          <h3>{prose.destiny.title}</h3>
          <Markdown md={prose.destiny.bodyMd} />
        </section>
      )}
      {prose.soulUrge && (
        <section className={styles.derivation} aria-label={prose.soulUrge.title}>
          <h3>{prose.soulUrge.title}</h3>
          <Markdown md={prose.soulUrge.bodyMd} />
        </section>
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
