"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JournalEntryView } from "@/lib/journal";
import type { TransitData } from "@/lib/transits";
import type { WheelChart } from "@/lib/view-types";
import type { AspectType, Planet } from "@astralsync/astro-core";
import {
  ASPECT_NAMES,
  PLANET_NAMES,
  formatBirthDate,
} from "@/components/format";
import { PLANET_GLYPH_CHARS } from "@/components/chart/glyphs";
import Markdown from "@/components/Markdown";
import {
  TransitAspectList,
  TransitPositionsTable,
  type TransitProse,
} from "@/components/transits/TransitTables";
import {
  MAX_JOURNAL_DATE,
  MIN_JOURNAL_DATE,
  clampJournalDate,
  localNoonIso,
  todayLocalDate,
} from "./journalDate";
import styles from "./journal.module.css";

type SkyPayload = TransitData & { prose?: TransitProse };

/** Serialized over JSON: Date fields arrive as strings. */
type EntryJson = Omit<JournalEntryView, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type SkyState =
  | { kind: "loading" }
  | { kind: "data"; data: SkyPayload }
  | { kind: "offline" }
  | { kind: "error" };

type EntriesState =
  | { kind: "loading" }
  | { kind: "data"; entries: EntryJson[] }
  | { kind: "offline" }
  | { kind: "error" };

/**
 * The Journal tab: notes pinned to a civil date, plus "what was hitting your
 * chart" for any date — the same ephemeral transit recompute as the Transits
 * tab, pinned via ?at= to local noon of the picked day (PRD §9: computed on
 * read, never stored). Notes are the one mutable per-profile store.
 */
export default function JournalPanel({
  profileId,
  chart,
  isLatest,
}: {
  profileId: number;
  chart: WheelChart;
  isLatest: boolean;
}) {
  const [date, setDate] = useState(todayLocalDate);
  const [sky, setSky] = useState<SkyState>({ kind: "loading" });
  const [entries, setEntries] = useState<EntriesState>({ kind: "loading" });
  // The add form's draft; editing state lives per-row in EntryRow.
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // Client-side filters over the loaded entries' stored skies.
  const [filterPlanet, setFilterPlanet] = useState<Planet | "">("");
  const [filterAspect, setFilterAspect] = useState<AspectType | "">("");

  const loadSky = useCallback(
    async (day: string) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSky({ kind: "offline" });
        return;
      }
      setSky({ kind: "loading" });
      let res: Response;
      try {
        res = await fetch(
          `/api/transits/${profileId}?at=${encodeURIComponent(localNoonIso(day))}`,
        );
      } catch {
        setSky({ kind: "offline" });
        return;
      }
      if (!res.ok) {
        setSky({ kind: "error" });
        return;
      }
      setSky({ kind: "data", data: await res.json() });
    },
    [profileId],
  );

  const loadEntries = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setEntries({ kind: "offline" });
      return;
    }
    setEntries({ kind: "loading" });
    let res: Response;
    try {
      res = await fetch(`/api/profiles/${profileId}/journal`);
    } catch {
      setEntries({ kind: "offline" });
      return;
    }
    if (!res.ok) {
      setEntries({ kind: "error" });
      return;
    }
    const body = (await res.json()) as { entries: EntryJson[] };
    setEntries({ kind: "data", entries: body.entries });
  }, [profileId]);

  useEffect(() => {
    void loadSky(date);
  }, [loadSky, date]);
  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // Auto-retry once connectivity returns (the house pattern).
  useEffect(() => {
    const onOnline = () => {
      setSky((s) => {
        if (s.kind === "offline") void loadSky(date);
        return s;
      });
      setEntries((s) => {
        if (s.kind === "offline") void loadEntries();
        return s;
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [loadSky, loadEntries, date]);

  async function addEntry() {
    const bodyMd = draft.trim();
    if (bodyMd === "" || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/profiles/${profileId}/journal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `at` pins the stored sky to the same local-noon instant the
        // "Sky on date" section shows.
        body: JSON.stringify({ entryDate: date, bodyMd, at: localNoonIso(date) }),
      });
      if (res.ok) {
        setDraft("");
        await loadEntries();
      }
    } catch {
      // Leave the draft intact; the entries list keeps its current state.
    } finally {
      setSaving(false);
    }
  }

  const moonReason =
    chart.uncertainties.find((u) => u.field === "moon_sign")?.reason ??
    "The natal Moon sign is uncertain.";
  const today = todayLocalDate();

  return (
    <div className={styles.panel}>
      <div className={styles.dateRow}>
        <label htmlFor="journal-date">Date</label>
        <input
          id="journal-date"
          type="date"
          value={date}
          min={MIN_JOURNAL_DATE}
          max={MAX_JOURNAL_DATE}
          onChange={(e) => setDate((prev) => clampJournalDate(e.target.value, prev))}
        />
        {date !== today && (
          <button onClick={() => setDate(today)}>Today</button>
        )}
      </div>

      {!isLatest && (
        <p className={styles.notice}>
          The sky is computed against the current chart version, not the
          historical version you are viewing.
        </p>
      )}

      <section aria-label="Sky on the selected date" aria-busy={sky.kind === "loading"}>
        <h3 className={styles.sectionTitle}>
          Sky on {formatBirthDate(date)}
        </h3>
        {sky.kind === "loading" && (
          <p className={styles.muted}>Computing the sky for {formatBirthDate(date)}…</p>
        )}
        {sky.kind === "offline" && (
          <div className={styles.notice} role="status">
            <p>
              The sky view needs a live connection — it is computed fresh for
              the picked date and never stored. Your notes below may also be
              unavailable offline.
            </p>
            <button onClick={() => void loadSky(date)}>Retry</button>
          </div>
        )}
        {sky.kind === "error" && (
          <div className={styles.notice} role="status">
            <p>Could not compute the sky for that date.</p>
            <button onClick={() => void loadSky(date)}>Retry</button>
          </div>
        )}
        {sky.kind === "data" && (
          <>
            <TransitPositionsTable
              placements={sky.data.placements}
              showHouses={!sky.data.natal.isSolarChart}
            />
            <h4 className={styles.subTitle}>Aspects to the natal chart</h4>
            <TransitAspectList
              aspects={sky.data.crossAspects}
              prose={sky.data.prose}
              moonUncertain={sky.data.natal.moonUncertain}
              moonReason={moonReason}
              emptyText="No transiting planet was within orb of a natal placement on this date (transits use tight orbs: 3° for the luminaries, 2° otherwise)."
            />
          </>
        )}
      </section>

      <section aria-label="Journal notes">
        <h3 className={styles.sectionTitle}>Notes</h3>

        <div className={styles.addForm}>
          <label htmlFor="journal-draft" className={styles.muted}>
            New note for {formatBirthDate(date)}
          </label>
          <textarea
            id="journal-draft"
            rows={4}
            maxLength={10_000}
            value={draft}
            placeholder="What happened, how it felt, what you noticed…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            onClick={() => void addEntry()}
            disabled={saving || draft.trim() === ""}
          >
            {saving ? "Saving…" : "Add note"}
          </button>
        </div>

        {entries.kind === "loading" && (
          <p className={styles.muted}>Loading notes…</p>
        )}
        {entries.kind === "offline" && (
          <div className={styles.notice} role="status">
            <p>Notes need a connection to load.</p>
            <button onClick={() => void loadEntries()}>Retry</button>
          </div>
        )}
        {entries.kind === "error" && (
          <div className={styles.notice} role="status">
            <p>Could not load notes.</p>
            <button onClick={() => void loadEntries()}>Retry</button>
          </div>
        )}
        {entries.kind === "data" &&
          (entries.entries.length === 0 ? (
            <p className={styles.muted}>
              No notes yet. Pick a date, see its sky, and write down what it
              looked like on the ground.
            </p>
          ) : (
            <FilteredEntries
              profileId={profileId}
              entries={entries.entries}
              filterPlanet={filterPlanet}
              filterAspect={filterAspect}
              onFilterPlanet={setFilterPlanet}
              onFilterAspect={setFilterAspect}
              onChanged={loadEntries}
              onViewDate={setDate}
            />
          ))}
      </section>
    </div>
  );
}

const FILTER_PLANETS: Planet[] = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

const FILTER_ASPECTS: AspectType[] = [
  "conjunction",
  "sextile",
  "square",
  "trine",
  "opposition",
];

function FilteredEntries({
  profileId,
  entries,
  filterPlanet,
  filterAspect,
  onFilterPlanet,
  onFilterAspect,
  onChanged,
  onViewDate,
}: {
  profileId: number;
  entries: EntryJson[];
  filterPlanet: Planet | "";
  filterAspect: AspectType | "";
  onFilterPlanet: (p: Planet | "") => void;
  onFilterAspect: (a: AspectType | "") => void;
  onChanged: () => Promise<void>;
  onViewDate: (date: string) => void;
}) {
  const active = filterPlanet !== "" || filterAspect !== "";
  const shown = useMemo(() => {
    if (!active) return entries;
    return entries.filter((e) =>
      e.sky?.crossAspects.some(
        (c) =>
          (filterPlanet === "" || c.a === filterPlanet) &&
          (filterAspect === "" || c.type === filterAspect),
      ),
    );
  }, [entries, active, filterPlanet, filterAspect]);

  return (
    <>
      <div className={styles.dateRow}>
        <label htmlFor="journal-filter-planet" className={styles.muted}>
          Sky filter
        </label>
        <select
          id="journal-filter-planet"
          value={filterPlanet}
          onChange={(e) => onFilterPlanet(e.target.value as Planet | "")}
        >
          <option value="">Any transiting planet</option>
          {FILTER_PLANETS.map((p) => (
            <option key={p} value={p}>
              {PLANET_NAMES[p]}
            </option>
          ))}
        </select>
        <select
          aria-label="Aspect filter"
          value={filterAspect}
          onChange={(e) => onFilterAspect(e.target.value as AspectType | "")}
        >
          <option value="">Any aspect</option>
          {FILTER_ASPECTS.map((a) => (
            <option key={a} value={a}>
              {ASPECT_NAMES[a]}
            </option>
          ))}
        </select>
      </div>
      {active && (
        <p className={styles.muted}>
          {shown.length} of {entries.length} notes match (notes without a
          stored sky never match).
        </p>
      )}
      <ul className={styles.entryList}>
        {shown.map((e) => (
          <EntryRow
            key={e.id}
            profileId={profileId}
            entry={e}
            onChanged={onChanged}
            onViewDate={onViewDate}
          />
        ))}
      </ul>
    </>
  );
}

function EntryRow({
  profileId,
  entry,
  onChanged,
  onViewDate,
}: {
  profileId: number;
  entry: EntryJson;
  onChanged: () => Promise<void>;
  onViewDate: (date: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.bodyMd);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    const bodyMd = text.trim();
    if (bodyMd === "" || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/profiles/${profileId}/journal/${entry.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bodyMd }),
        },
      );
      if (res.ok) {
        setEditing(false);
        await onChanged();
      }
    } catch {
      // Keep the editor open with the unsaved text.
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/profiles/${profileId}/journal/${entry.id}`,
        { method: "DELETE" },
      );
      if (res.ok) await onChanged();
    } catch {
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const edited = entry.updatedAt !== entry.createdAt;

  return (
    <li className={styles.entry}>
      <div className={styles.entryHeader}>
        <button
          className={styles.entryDate}
          onClick={() => onViewDate(entry.entryDate)}
          title="Show this date's sky"
        >
          {formatBirthDate(entry.entryDate)}
        </button>
        <span className={styles.entryActions}>
          {!editing && (
            <button
              onClick={() => {
                setText(entry.bodyMd);
                setEditing(true);
                setConfirmingDelete(false);
              }}
            >
              Edit
            </button>
          )}
          {confirmingDelete ? (
            <>
              <button
                className={styles.danger}
                onClick={() => void remove()}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Confirm delete"}
              </button>
              <button onClick={() => setConfirmingDelete(false)}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirmingDelete(true)}>Delete</button>
          )}
        </span>
      </div>
      {editing ? (
        <div className={styles.addForm}>
          <textarea
            rows={4}
            maxLength={10_000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Edit note"
          />
          <span className={styles.entryActions}>
            <button
              onClick={() => void save()}
              disabled={busy || text.trim() === ""}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </span>
        </div>
      ) : (
        <div className={styles.entryBody}>
          <Markdown md={entry.bodyMd} />
        </div>
      )}
      {entry.sky && (
        <details className={styles.skyDetails}>
          <summary>Sky at this entry</summary>
          <p className={styles.muted}>
            Saved against chart v{entry.sky.natalVersion} (
            {entry.sky.engine.name} {entry.sky.engine.version}). The date
            button above shows the live recompute.
          </p>
          {entry.sky.crossAspects.length === 0 ? (
            <p className={styles.muted}>
              No transiting planet was within orb of a natal placement.
            </p>
          ) : (
            <ul className={styles.skyChips}>
              {entry.sky.crossAspects.map((c) => (
                <li key={`${c.a}-${c.b}-${c.type}`} className={styles.skyChip}>
                  <span aria-hidden="true">{PLANET_GLYPH_CHARS[c.a]}</span>{" "}
                  {PLANET_NAMES[c.a]} {ASPECT_NAMES[c.type].toLowerCase()}{" "}
                  natal <span aria-hidden="true">{PLANET_GLYPH_CHARS[c.b]}</span>{" "}
                  {PLANET_NAMES[c.b]}{" "}
                  <span className={styles.muted}>({c.orb.toFixed(1)}°)</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      {edited && !editing && <p className={styles.muted}>Edited</p>}
    </li>
  );
}
