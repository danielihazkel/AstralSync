import type { NameNumberResult } from "@astralsync/numero-core";
import styles from "./numerology.module.css";

function Chain({ start, steps }: { start: number; steps: number[] }) {
  const chain = steps[0] === start ? steps : [start, ...steps];
  return <span className={styles.chain}>{chain.join(" → ")}</span>;
}

/**
 * Per-word letter-by-letter breakdown (PRD §3.3). Hebrew gematria renders
 * right-to-left; Pythagorean marks the vowels counted by Soul Urge.
 */
export default function NameDerivation({
  title,
  result,
}: {
  title: string;
  result: NameNumberResult;
}) {
  const isGematria = result.system === "gematria";
  return (
    <section className={styles.derivation}>
      <h3>{title}</h3>
      {result.derivation.words.map((w) => (
        <div key={w.word} className={styles.word}>
          <div
            className={styles.letterGrid}
            dir={isGematria ? "rtl" : "ltr"}
            lang={isGematria ? "he" : undefined}
          >
            {w.letters.map((l, i) => (
              <span
                key={`${l.char}-${i}`}
                className={l.isVowel ? styles.letterVowel : styles.letter}
                title={l.isVowel ? "vowel" : undefined}
              >
                <span className={styles.letterChar}>{l.char}</span>
                <span className={styles.letterValue}>{l.value}</span>
              </span>
            ))}
          </div>
          <p className={styles.wordSum}>
            {w.word}: {w.letters.map((l) => l.value).join(" + ")} ={" "}
            {w.subtotal}
            {w.steps.length > 1 && (
              <>
                , <Chain start={w.subtotal} steps={w.steps} />
              </>
            )}
          </p>
        </div>
      ))}
      <p className={styles.totalRow}>
        {result.derivation.words.map((w) => w.reduced).join(" + ")} ={" "}
        {result.derivation.total},{" "}
        <Chain
          start={result.derivation.total}
          steps={result.derivation.steps}
        />{" "}
        → <strong>{result.value}</strong>
        {result.isMaster && (
          <span className={styles.masterNote}> (master number — not reduced)</span>
        )}
      </p>
    </section>
  );
}
