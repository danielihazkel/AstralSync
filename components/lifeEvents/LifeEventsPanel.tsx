"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LifeEventView } from "@/lib/lifeEvents";
import type { AstroView } from "@/lib/view-types";
import {
  LIFE_EVENT_CATEGORIES,
  LIFE_EVENT_CATEGORY_LABELS,
  LIFE_EVENT_PRECISIONS,
  MAX_LIFE_EVENT_NOTES,
  MAX_LIFE_EVENT_TITLE,
  formatEventDate,
  type LifeEventCategory,
  type LifeEventPrecision,
} from "@/lib/lifeEventMeta";
import {
  MAX_EVENT_DATE,
  MAX_EVENT_YEAR,
  MIN_EVENT_DATE,
  MIN_EVENT_YEAR,
  dateFromInputs,
  inputsFromEvent,
  type EventDateInputs,
} from "./eventDateInput";
import EmptyState from "@/components/EmptyState";
import Markdown from "@/components/Markdown";
import DiscardReadingButton from "@/components/profile/DiscardReadingButton";
import { announceUndo, restoreFromTrash } from "@/components/undo/undoBus";
import { useStreamedGeneration } from "@/components/useStreamedGeneration";
import styles from "./lifeEvents.module.css";

/** Serialized over JSON: Date fields arrive as strings. */
type EventJson = Omit<LifeEventView, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type EventsState =
  | { kind: "loading" }
  | { kind: "data"; events: EventJson[] }
  | { kind: "offline" }
  | { kind: "error" };

const PRECISION_LABEL: Record<LifeEventPrecision, string> = {
  day: "Exact date",
  month: "Month & year",
  year: "Year only",
};

const EMPTY_INPUTS: EventDateInputs = { day: "", month: "", year: "" };

function dateOnly(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/** The precision-appropriate native date input (no picker library). */
function DateInput({
  precision,
  inputs,
  onChange,
}: {
  precision: LifeEventPrecision;
  inputs: EventDateInputs;
  onChange: (v: EventDateInputs) => void;
}) {
  if (precision === "day") {
    return (
      <input
        type="date"
        value={inputs.day}
        min={MIN_EVENT_DATE}
        max={MAX_EVENT_DATE}
        aria-label="Event date"
        onChange={(e) => onChange({ ...inputs, day: e.target.value })}
      />
    );
  }
  if (precision === "month") {
    return (
      <input
        type="month"
        value={inputs.month}
        min="1700-01"
        max="2199-12"
        aria-label="Event month"
        onChange={(e) => onChange({ ...inputs, month: e.target.value })}
      />
    );
  }
  return (
    <input
      type="number"
      className={styles.yearInput}
      value={inputs.year}
      min={MIN_EVENT_YEAR}
      max={MAX_EVENT_YEAR}
      inputMode="numeric"
      placeholder="Year"
      aria-label="Event year"
      onChange={(e) => onChange({ ...inputs, year: e.target.value })}
    />
  );
}

/**
 * The Life events tab: major dated milestones (with only the precision the
 * user actually remembers) plus the Life Story reading — the one AI reading
 * that deliberately combines the events with the full birth data, chart and
 * numerology. Events are the mutable per-profile store (the Journal
 * stance); the stored story is discardable and regenerable to fold in new
 * events.
 */
export default function LifeEventsPanel({
  profileId,
  version,
  lifeStoryReading,
  llmEnabled,
}: {
  profileId: number;
  version: number;
  lifeStoryReading: AstroView["lifeStoryReading"];
  llmEnabled: boolean;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<EventsState>({ kind: "loading" });
  // The add form's draft; editing state lives per-row in EventRow.
  const [title, setTitle] = useState("");
  const [precision, setPrecision] = useState<LifeEventPrecision>("day");
  const [dateInputs, setDateInputs] = useState<EventDateInputs>(EMPTY_INPUTS);
  const [category, setCategory] = useState<LifeEventCategory>("other");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const { busy, streamText, generate: streamGenerate, reset } =
    useStreamedGeneration();

  const loadEvents = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setEvents({ kind: "offline" });
      return;
    }
    setEvents({ kind: "loading" });
    let res: Response;
    try {
      res = await fetch(`/api/profiles/${profileId}/life-events`);
    } catch {
      setEvents({ kind: "offline" });
      return;
    }
    if (!res.ok) {
      setEvents({ kind: "error" });
      return;
    }
    const body = (await res.json()) as { events: EventJson[] };
    setEvents({ kind: "data", events: body.events });
  }, [profileId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // Auto-retry once connectivity returns (the house pattern).
  useEffect(() => {
    const onOnline = () => {
      setEvents((s) => {
        if (s.kind === "offline") void loadEvents();
        return s;
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [loadEvents]);

  // Once the stored reading arrives (post-refresh), drop the live preview so
  // a later discard doesn't resurrect stale text.
  useEffect(() => {
    if (lifeStoryReading) reset();
  }, [lifeStoryReading, reset]);

  const eventDate = dateFromInputs(precision, dateInputs);
  const canAdd = !saving && title.trim() !== "" && eventDate !== null;

  async function addEvent() {
    if (!canAdd || eventDate === null) return;
    setSaving(true);
    setFormError(null);
    try {
      const note = notes.trim();
      const res = await fetch(`/api/profiles/${profileId}/life-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          eventDate,
          precision,
          category,
          ...(note !== "" ? { notesMd: note } : {}),
        }),
      });
      if (res.status === 409) {
        setFormError(
          "This profile has reached the life-event limit — delete an old event first.",
        );
        return;
      }
      if (res.ok) {
        setTitle("");
        setDateInputs(EMPTY_INPUTS);
        setNotes("");
        await loadEvents();
      } else {
        setFormError("Could not save the event.");
      }
    } catch {
      // Leave the draft intact; the list keeps its current state.
    } finally {
      setSaving(false);
    }
  }

  const eventCount = events.kind === "data" ? events.events.length : null;

  // Events edited or added after the story was generated ⇒ suggest a
  // regenerate. Misses pure deletions (nothing newer remains) — acceptable.
  const stale = useMemo(() => {
    if (!lifeStoryReading || events.kind !== "data") return false;
    const generatedAt = new Date(lifeStoryReading.createdAt).getTime();
    return events.events.some(
      (e) => new Date(e.updatedAt).getTime() > generatedAt,
    );
  }, [lifeStoryReading, events]);

  async function generate() {
    setGenError(null);
    const result = await streamGenerate(
      `/api/profiles/${profileId}/life-story?stream=1`,
      { version },
    );
    if (
      result.ok ||
      result.status === 409 ||
      result.errorCode === "already_generated"
    ) {
      // 409 ⇒ generated concurrently or hook toggled — refresh shows reality.
      router.refresh();
      return;
    }
    reset();
    setGenError(
      result.status === 502 || result.errorCode === "llm_unavailable"
        ? "The language model isn't reachable right now. Your events are saved — try again once it's running."
        : `Could not generate the Life Story${result.status ? ` (HTTP ${result.status})` : ""}.`,
    );
  }

  return (
    <div className={styles.panel}>
      <section aria-label="Major life events">
        <h3 className={styles.sectionTitle}>Major life events</h3>
        <p className={styles.muted}>
          Record the big milestones — marriages, births, moves, career turns.
          The Life Story reading below weaves them together with your chart
          and numerology.
        </p>

        <div className={styles.addForm}>
          <input
            type="text"
            className={styles.titleInput}
            value={title}
            maxLength={MAX_LIFE_EVENT_TITLE}
            placeholder="What happened? (e.g. Moved abroad)"
            aria-label="Event title"
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className={styles.formRow}>
            <select
              value={precision}
              aria-label="Date precision"
              onChange={(e) =>
                setPrecision(e.target.value as LifeEventPrecision)
              }
            >
              {LIFE_EVENT_PRECISIONS.map((p) => (
                <option key={p} value={p}>
                  {PRECISION_LABEL[p]}
                </option>
              ))}
            </select>
            <DateInput
              precision={precision}
              inputs={dateInputs}
              onChange={setDateInputs}
            />
            <select
              value={category}
              aria-label="Category"
              onChange={(e) =>
                setCategory(e.target.value as LifeEventCategory)
              }
            >
              {LIFE_EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {LIFE_EVENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            maxLength={MAX_LIFE_EVENT_NOTES}
            value={notes}
            placeholder="Notes (optional) — what it meant, how it felt…"
            aria-label="Notes"
            onChange={(e) => setNotes(e.target.value)}
          />
          <button onClick={() => void addEvent()} disabled={!canAdd}>
            {saving ? "Saving…" : "Add event"}
          </button>
          {formError && <p className={styles.error}>{formError}</p>}
        </div>

        {events.kind === "loading" && (
          <p className={styles.muted}>Loading events…</p>
        )}
        {events.kind === "offline" && (
          <div className={styles.notice} role="status">
            <p>Life events need a connection to load.</p>
            <button onClick={() => void loadEvents()}>Retry</button>
          </div>
        )}
        {events.kind === "error" && (
          <div className={styles.notice} role="status">
            <p>Could not load life events.</p>
            <button onClick={() => void loadEvents()}>Retry</button>
          </div>
        )}
        {events.kind === "data" &&
          (events.events.length === 0 ? (
            <EmptyState
              title="No life events yet"
              hint="Add the moments that shaped your story — then generate the Life Story reading below."
            />
          ) : (
            <ul className={styles.entryList}>
              {events.events.map((e) => (
                <EventRow
                  key={e.id}
                  profileId={profileId}
                  event={e}
                  onChanged={loadEvents}
                />
              ))}
            </ul>
          ))}
      </section>

      <section aria-label="Life Story reading">
        <h3 className={styles.sectionTitle}>Life Story</h3>
        {lifeStoryReading ? (
          <>
            <p className={styles.readingSource}>
              Generated by {lifeStoryReading.modelName ?? "a local model"} on{" "}
              {dateOnly(lifeStoryReading.createdAt)} — stored with this chart
              version.
            </p>
            {stale && (
              <p className={styles.staleNote}>
                Events have changed since this story was generated — discard
                it and generate again to include them.
              </p>
            )}
            <div className={styles.readingBody}>
              <Markdown md={lifeStoryReading.bodyMd} />
            </div>
            <div className={styles.actionRow}>
              <DiscardReadingButton
                endpoint={`/api/profiles/${profileId}/life-story?version=${version}`}
              />
            </div>
          </>
        ) : (
          <>
            {streamText !== null && (
              <div aria-label="Life Story (generating)">
                <p className={styles.readingSource}>
                  {busy ? "Generating…" : "Finishing up…"}
                </p>
                <div className={styles.readingBody} aria-live="polite">
                  <Markdown md={streamText} />
                </div>
              </div>
            )}
            {llmEnabled ? (
              <div className={styles.addForm}>
                <div className={styles.actionRow}>
                  <button
                    onClick={() => void generate()}
                    disabled={
                      busy || events.kind !== "data" || eventCount === 0
                    }
                  >
                    {busy ? "Generating…" : "Generate Life Story"}
                  </button>
                  {eventCount === 0 && (
                    <span className={styles.muted}>
                      Record at least one life event first.
                    </span>
                  )}
                </div>
                <p className={styles.muted}>
                  Unlike other readings, the Life Story prompt shares your
                  exact birth date, time and place with the language model,
                  together with the events above. Discard and regenerate any
                  time to fold in new events.
                </p>
                {genError && <p className={styles.error}>{genError}</p>}
              </div>
            ) : (
              <p className={styles.muted}>
                The Life Story reading needs the AI hook (READING_LLM) to be
                configured — your events are stored either way.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function EventRow({
  profileId,
  event,
  onChanged,
}: {
  profileId: number;
  event: EventJson;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [precision, setPrecision] = useState<LifeEventPrecision>(
    event.precision,
  );
  const [inputs, setInputs] = useState<EventDateInputs>(() =>
    inputsFromEvent(event.eventDate, event.precision),
  );
  const [category, setCategory] = useState<LifeEventCategory>(event.category);
  const [notes, setNotes] = useState(event.notesMd ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const eventDate = dateFromInputs(precision, inputs);
  const canSave = !busy && title.trim() !== "" && eventDate !== null;

  async function save() {
    if (!canSave || eventDate === null) return;
    setBusy(true);
    try {
      const note = notes.trim();
      const res = await fetch(
        `/api/profiles/${profileId}/life-events/${event.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // The edit form is the source of truth — send everything; null
          // clears the notes.
          body: JSON.stringify({
            title: title.trim(),
            eventDate,
            precision,
            category,
            notesMd: note === "" ? null : note,
          }),
        },
      );
      if (res.ok) {
        setEditing(false);
        await onChanged();
      }
    } catch {
      // Keep the editor open with the unsaved values.
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/profiles/${profileId}/life-events/${event.id}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        announceUndo({
          message: `“${event.title}” moved to the Trash.`,
          restore: () => restoreFromTrash("event", event.id),
          onRestored: () => void onChanged(),
        });
        await onChanged();
      }
    } catch {
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={styles.entry}>
      <div className={styles.entryHeader}>
        <span className={styles.entryTitle}>
          <strong>{event.title}</strong>{" "}
          <span className={styles.entryDate}>
            {formatEventDate(event.eventDate, event.precision)}
          </span>
        </span>
        <span className={styles.entryActions}>
          {!editing && (
            <button
              onClick={() => {
                setTitle(event.title);
                setPrecision(event.precision);
                setInputs(inputsFromEvent(event.eventDate, event.precision));
                setCategory(event.category);
                setNotes(event.notesMd ?? "");
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
              <button onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmingDelete(true)}>Delete</button>
          )}
        </span>
      </div>
      {editing ? (
        <div className={styles.addForm}>
          <input
            type="text"
            className={styles.titleInput}
            value={title}
            maxLength={MAX_LIFE_EVENT_TITLE}
            aria-label="Edit title"
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className={styles.formRow}>
            <select
              value={precision}
              aria-label="Date precision"
              onChange={(e) =>
                setPrecision(e.target.value as LifeEventPrecision)
              }
            >
              {LIFE_EVENT_PRECISIONS.map((p) => (
                <option key={p} value={p}>
                  {PRECISION_LABEL[p]}
                </option>
              ))}
            </select>
            <DateInput
              precision={precision}
              inputs={inputs}
              onChange={setInputs}
            />
            <select
              value={category}
              aria-label="Category"
              onChange={(e) =>
                setCategory(e.target.value as LifeEventCategory)
              }
            >
              {LIFE_EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {LIFE_EVENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            maxLength={MAX_LIFE_EVENT_NOTES}
            value={notes}
            placeholder="Notes (optional)"
            aria-label="Edit notes"
            onChange={(e) => setNotes(e.target.value)}
          />
          <span className={styles.entryActions}>
            <button onClick={() => void save()} disabled={!canSave}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </span>
        </div>
      ) : (
        <>
          <span className={styles.chip}>
            {LIFE_EVENT_CATEGORY_LABELS[event.category]}
          </span>
          {event.notesMd && (
            <div className={styles.entryBody}>
              <Markdown md={event.notesMd} />
            </div>
          )}
        </>
      )}
    </li>
  );
}
