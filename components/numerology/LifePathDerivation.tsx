import type { LifePathResult } from "@astralsync/numero-core";
import styles from "./numerology.module.css";

function Chain({ start, steps }: { start: number; steps: number[] }) {
  const chain = steps[0] === start ? steps : [start, ...steps];
  return <span className={styles.chain}>{chain.join(" → ")}</span>;
}

/** Three-cycles Life Path derivation: month, day, and year each reduce
 *  first, then their sum reduces — master numbers are never reduced. */
export default function LifePathDerivation({
  result,
}: {
  result: LifePathResult;
}) {
  return (
    <section className={styles.derivation}>
      <h3>Life Path — how it was derived</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Cycle</th>
            <th scope="col">Raw</th>
            <th scope="col">Reduction</th>
          </tr>
        </thead>
        <tbody>
          {result.derivation.components.map((c) => (
            <tr key={c.part}>
              <th scope="row">{c.part}</th>
              <td>{c.raw}</td>
              <td>
                <Chain start={c.raw} steps={c.steps} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.totalRow}>
        {result.derivation.components.map((c) => c.reduced).join(" + ")} ={" "}
        {result.derivation.total},{" "}
        <Chain start={result.derivation.total} steps={result.derivation.steps} />
        {" "}→ <strong>Life Path {result.value}</strong>
        {result.isMaster && (
          <span className={styles.masterNote}>
            {" "}
            (11, 22 and 33 are master numbers and are never reduced)
          </span>
        )}
      </p>
    </section>
  );
}
