"use client";

import { useCallback, useEffect, useState } from "react";
import Markdown from "@/components/Markdown";
import { useStreamedGeneration } from "@/components/useStreamedGeneration";
import discardStyles from "@/components/profiles/DeleteProfileButton.module.css";
import styles from "./forecast.module.css";

export type ForecastMode = "western" | "hebrew";
export type ForecastKind = "day" | "week" | "month";

interface CivilDate {
  year: number;
  month: number;
  day: number;
}

interface ForecastResponse {
  period: { kind: ForecastKind; start: CivilDate; end: CivilDate; days: number };
  natalVersion: number;
  forecast: {
    bodyMd: string;
    modelName: string | null;
    contentVersion: string | null;
    createdAt: string;
    natalVersion: number;
  } | null;
}

type State =
  | { kind: "loading" }
  | { kind: "data"; data: ForecastResponse }
  | { kind: "offline" }
  | { kind: "error" };

function fmtCivil(d: CivilDate): string {
  return new Date(d.year, d.month - 1, d.day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function periodLabel(p: ForecastResponse["period"]): string {
  if (p.kind === "day") return fmtCivil(p.start);
  return `${fmtCivil(p.start)} – ${fmtCivil(p.end)}`;
}

/**
 * One forecast cell (mode × kind): shows the stored AI forecast for the
 * current period, or a generate button when none exists. Cached per period
 * server-side — regenerating requires an explicit discard. Client-fetched
 * (TransitsPanel pattern) because the period key changes with the kind
 * switcher without a navigation.
 */
export default function ForecastCard({
  profileId,
  mode,
  kind,
  llmEnabled,
  heading,
}: {
  profileId: number;
  mode: ForecastMode;
  kind: ForecastKind;
  llmEnabled: boolean;
  heading?: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [discarding, setDiscarding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const {
    busy: generating,
    streamText,
    generate: streamGenerate,
    reset,
  } = useStreamedGeneration();
  const busy = discarding || generating;

  const query = `mode=${mode}&kind=${kind}`;

  const load = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState({ kind: "offline" });
      return;
    }
    setState({ kind: "loading" });
    setActionError(null);
    setConfirming(false);
    let res: Response;
    try {
      res = await fetch(`/api/profiles/${profileId}/forecast?${query}`);
    } catch {
      setState({ kind: "offline" });
      return;
    }
    if (!res.ok) {
      setState({ kind: "error" });
      return;
    }
    setState({ kind: "data", data: await res.json() });
  }, [profileId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOnline = () => {
      setState((s) => {
        if (s.kind === "offline") void load();
        return s;
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  async function generate() {
    setActionError(null);
    const result = await streamGenerate(
      `/api/profiles/${profileId}/forecast?stream=1`,
      { mode, kind },
    );
    if (result.ok || result.status === 409 || result.errorCode === "already_generated") {
      // 409 ⇒ generated concurrently or hook toggled — reload shows reality.
      await load();
      reset();
      return;
    }
    reset();
    setActionError(
      result.status === 502 || result.errorCode === "llm_unavailable"
        ? "The language model isn't reachable right now. Your charts and stored forecasts are unaffected — try again once it's running."
        : "Could not generate the forecast.",
    );
  }

  async function discard() {
    setDiscarding(true);
    setActionError(null);
    const res = await fetch(`/api/profiles/${profileId}/forecast?${query}`, {
      method: "DELETE",
    }).catch(() => null);
    setDiscarding(false);
    // 404 ⇒ discarded concurrently — reload shows reality either way.
    if (!res || (!res.ok && res.status !== 404)) {
      setActionError("Discard failed — is the server running?");
      return;
    }
    void load();
  }

  const title = heading ?? (mode === "western" ? "Western transits" : "Hebrew (Mazal)");

  if (state.kind === "loading") {
    return (
      <section className={styles.card} aria-label={title}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <p className={styles.muted}>Loading forecast…</p>
      </section>
    );
  }
  if (state.kind === "offline" || state.kind === "error") {
    return (
      <section className={styles.card} aria-label={title}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <div className={styles.notice} role="status">
          <p>
            {state.kind === "offline"
              ? "Forecasts need a live connection. Stored charts and readings still work offline."
              : "Could not load the forecast right now."}
          </p>
          <button onClick={() => void load()}>Retry</button>
        </div>
      </section>
    );
  }

  const { period, natalVersion, forecast } = state.data;
  // Stored bodies are English by design; pre-render sniffing matches
  // MazalPanel's fallback in case a model slips into Hebrew.
  const isHebrewBody = forecast ? /[֐-׿]/.test(forecast.bodyMd) : false;

  return (
    <section className={styles.card} aria-label={title}>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.provenance}>{periodLabel(period)}</p>

      {forecast ? (
        <>
          {forecast.natalVersion !== natalVersion && (
            <p className={styles.staleNote}>
              Generated against chart version {forecast.natalVersion}; the
              current version is {natalVersion}. Discard to regenerate against
              the current chart.
            </p>
          )}
          <div
            className={styles.body}
            lang={isHebrewBody ? "he" : undefined}
            dir={isHebrewBody ? "rtl" : undefined}
          >
            <Markdown md={forecast.bodyMd} />
          </div>
          <p className={styles.provenance}>
            Generated by {forecast.modelName ?? "a local model"} on{" "}
            {new Date(forecast.createdAt).toISOString().slice(0, 10)} — stored
            for this period.
          </p>
          <div className={styles.actionRow}>
            {confirming ? (
              <span className={discardStyles.confirmRow}>
                {actionError ? (
                  <span className={discardStyles.error}>{actionError}</span>
                ) : (
                  <span className={discardStyles.prompt}>
                    Discard this forecast? The text is removed permanently, but
                    a new one can be generated.
                  </span>
                )}
                <button
                  className={discardStyles.confirm}
                  onClick={discard}
                  disabled={busy}
                >
                  {busy ? "Discarding…" : "Discard"}
                </button>
                <button
                  className={discardStyles.cancel}
                  onClick={() => {
                    setConfirming(false);
                    setActionError(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                className={discardStyles.trigger}
                onClick={() => setConfirming(true)}
                aria-label={`Discard this ${kind} forecast`}
              >
                Discard
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {streamText !== null ? (
            <div className={styles.body} aria-live="polite">
              <Markdown md={streamText} />
              <p className={styles.hint}>
                {generating ? "Generating…" : "Finishing up…"}
              </p>
            </div>
          ) : (
            <p className={styles.muted}>
              No AI forecast has been generated for this period yet.
            </p>
          )}
          {llmEnabled ? (
            <div className={styles.actionRow}>
              <button onClick={generate} disabled={busy}>
                {busy ? "Generating…" : "Generate forecast"}
              </button>
              <span className={styles.hint}>
                {" "}
                Runs once per period and is stored until discarded.
              </span>
              {actionError && <p className={styles.error}>{actionError}</p>}
            </div>
          ) : (
            <p className={styles.hint}>
              AI generation is off — configure READING_LLM to enable it.
            </p>
          )}
        </>
      )}
    </section>
  );
}
