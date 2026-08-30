"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./synastry.module.css";

/** Pick two profiles to compare — the entry point to /synastry on the
 *  profile list. A small client island like DeleteProfileButton; the list
 *  itself stays server-rendered. `defaultA` (the primary profile) prefills
 *  the first slot so "me vs. X" is one click. */
export default function PairPicker({
  profiles,
  defaultA = null,
}: {
  profiles: { id: number; displayName: string }[];
  defaultA?: number | null;
}) {
  const [a, setA] = useState(
    defaultA !== null && profiles.some((p) => p.id === defaultA)
      ? String(defaultA)
      : "",
  );
  const [b, setB] = useState("");
  const ready = a !== "" && b !== "" && a !== b;

  const options = (exclude: string) =>
    profiles
      .filter((p) => String(p.id) !== exclude)
      .map((p) => (
        <option key={p.id} value={p.id}>
          {p.displayName}
        </option>
      ));

  return (
    <section className={styles.picker} aria-label="Synastry">
      <h2 className={styles.pickerTitle}>Synastry — compare two charts</h2>
      <div className={styles.pickerRow}>
        <select
          aria-label="First person (inner wheel)"
          value={a}
          onChange={(e) => setA(e.target.value)}
        >
          <option value="">First person…</option>
          {options(b)}
        </select>
        <select
          aria-label="Second person (outer ring)"
          value={b}
          onChange={(e) => setB(e.target.value)}
        >
          <option value="">Second person…</option>
          {options(a)}
        </select>
        {ready ? (
          <Link href={`/synastry?a=${a}&b=${b}`} className={styles.compare}>
            Compare
          </Link>
        ) : (
          <span className={styles.compareDisabled} aria-disabled="true">
            Compare
          </span>
        )}
      </div>
    </section>
  );
}
