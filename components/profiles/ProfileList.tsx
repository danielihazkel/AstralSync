"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Sign } from "@astralsync/astro-core";
import {
  SIGN_NAMES,
  TIME_CERTAINTY_LABELS,
  formatBirthDate,
} from "@/components/format";
import DeleteProfileButton from "./DeleteProfileButton";
import {
  PROFILE_SORT_LABELS,
  filterProfiles,
  sortProfiles,
  type ProfileListItem,
  type ProfileSortKey,
} from "./profileListSort";
import cardStyles from "@/app/page.module.css";
import styles from "./ProfileList.module.css";

/** Threshold below which search/sort controls are just clutter. */
const CONTROLS_MIN_PROFILES = 6;

export default function ProfileList({ profiles }: { profiles: ProfileListItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProfileSortKey>("created");

  const visible = useMemo(
    () => sortProfiles(filterProfiles(profiles, query), sort),
    [profiles, query, sort],
  );

  return (
    <>
      {profiles.length >= CONTROLS_MIN_PROFILES && (
        <div className={styles.controls}>
          <input
            type="search"
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search profiles…"
            aria-label="Search profiles by name"
          />
          <label className={styles.sortLabel}>
            Sort by{" "}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ProfileSortKey)}
            >
              {(
                Object.entries(PROFILE_SORT_LABELS) as [ProfileSortKey, string][]
              ).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {visible.length === 0 ? (
        <p className={styles.noMatch}>No profiles match “{query.trim()}”.</p>
      ) : (
        <ul className={cardStyles.list}>
          {visible.map((p) => (
            <li key={p.id} className={cardStyles.card}>
              <Link href={`/profiles/${p.id}`} className={cardStyles.cardLink}>
                <span className={cardStyles.name}>{p.displayName}</span>
                <span className={cardStyles.meta}>
                  {formatBirthDate(p.birthDate)}
                  {p.sunSign ? ` · ${SIGN_NAMES[p.sunSign as Sign]} Sun` : ""}
                </span>
                <span className={cardStyles.tags}>
                  {p.isSolarChart && (
                    <span className={cardStyles.tag}>Solar chart</span>
                  )}
                  {p.timeCertainty === "approx" && (
                    <span className={cardStyles.tag}>
                      {TIME_CERTAINTY_LABELS.approx}
                    </span>
                  )}
                </span>
              </Link>
              <DeleteProfileButton profileId={p.id} displayName={p.displayName} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
