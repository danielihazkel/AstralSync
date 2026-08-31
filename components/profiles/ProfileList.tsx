"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Sign } from "@astralsync/astro-core";
import {
  SIGN_NAMES,
  TIME_CERTAINTY_LABELS,
  formatBirthDate,
} from "@/components/format";
import EmptyState from "@/components/EmptyState";
import DeleteProfileButton from "./DeleteProfileButton";
import {
  PROFILE_SORT_LABELS,
  applyChipFilters,
  distinctSunSigns,
  distinctTags,
  filterProfiles,
  sortProfiles,
  type ProfileListItem,
  type ProfileSortKey,
} from "./profileListSort";
import cardStyles from "@/app/page.module.css";
import styles from "./ProfileList.module.css";

/** Threshold below which search/sort controls are just clutter. */
const CONTROLS_MIN_PROFILES = 6;
/** Render guardrail: above this many rows a "Show all" step keeps the
 *  initial DOM light without a virtualization dependency. */
const RENDER_CAP = 50;

export default function ProfileList({ profiles }: { profiles: ProfileListItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProfileSortKey>("created");
  const [tag, setTag] = useState("");
  const [sunSign, setSunSign] = useState("");
  const [showAll, setShowAll] = useState(false);

  const tags = useMemo(() => distinctTags(profiles), [profiles]);
  const sunSigns = useMemo(() => distinctSunSigns(profiles), [profiles]);
  const visible = useMemo(
    () =>
      sortProfiles(
        applyChipFilters(filterProfiles(profiles, query), { tag, sunSign }),
        sort,
      ),
    [profiles, query, sort, tag, sunSign],
  );
  const rendered = showAll ? visible : visible.slice(0, RENDER_CAP);
  const filtersActive = query.trim() !== "" || tag !== "" || sunSign !== "";

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
            aria-label="Search profiles by name or tag"
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
          {sunSigns.length > 1 && (
            <label className={styles.sortLabel}>
              Sun{" "}
              <select
                value={sunSign}
                onChange={(e) => setSunSign(e.target.value)}
                aria-label="Filter by Sun sign"
              >
                <option value="">Any sign</option>
                {sunSigns.map((s) => (
                  <option key={s} value={s}>
                    {SIGN_NAMES[s as Sign]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className={styles.chips} role="group" aria-label="Filter by tag">
          {tags.map((t) => (
            <button
              key={t}
              className={t === tag ? styles.chipActive : styles.chip}
              aria-pressed={t === tag}
              onClick={() => setTag(t === tag ? "" : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          glyph="☾"
          title="No profiles match"
          hint={
            filtersActive
              ? "Nothing fits the current search and filters — clear them to see every chart."
              : "No profiles to show."
          }
        />
      ) : (
        <>
          <ul className={cardStyles.list}>
            {rendered.map((p) => (
              <li key={p.id} className={cardStyles.card}>
                <Link href={`/profiles/${p.id}`} className={cardStyles.cardLink}>
                  <span className={cardStyles.name}>{p.displayName}</span>
                  <span className={cardStyles.meta}>
                    {formatBirthDate(p.birthDate)}
                    {p.sunSign ? ` · ${SIGN_NAMES[p.sunSign as Sign]} Sun` : ""}
                  </span>
                  <span className={cardStyles.tags}>
                    {p.isPrimary && (
                      <span className={cardStyles.tag} title="Your chart">
                        ★ Mine
                      </span>
                    )}
                    {p.isSolarChart && (
                      <span className={cardStyles.tag}>Solar chart</span>
                    )}
                    {p.timeCertainty === "approx" && (
                      <span className={cardStyles.tag}>
                        {TIME_CERTAINTY_LABELS.approx}
                      </span>
                    )}
                    {p.tags.slice(0, 3).map((t) => (
                      <span key={t} className={styles.tagBadge}>
                        #{t}
                      </span>
                    ))}
                  </span>
                </Link>
                <DeleteProfileButton profileId={p.id} displayName={p.displayName} />
              </li>
            ))}
          </ul>
          {!showAll && visible.length > RENDER_CAP && (
            <p className={styles.showAllRow}>
              <button
                className={styles.showAll}
                onClick={() => setShowAll(true)}
              >
                Show all {visible.length} profiles
              </button>
            </p>
          )}
        </>
      )}
    </>
  );
}
