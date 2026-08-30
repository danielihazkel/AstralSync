"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UNDO_EVENT, UNDO_TIMEOUT_MS, type UndoRequest } from "./undoBus";
import styles from "./undo.module.css";

type ToastState =
  | { kind: "idle" }
  | { kind: "offer"; req: UndoRequest }
  | { kind: "restoring"; req: UndoRequest }
  | { kind: "failed"; req: UndoRequest };

/**
 * The single Undo toast: listens for announceUndo() and offers Undo for
 * UNDO_TIMEOUT_MS. Only the latest request is shown — a second delete
 * replaces the first, whose item remains restorable from Settings → Trash.
 */
export function UndoToast() {
  const router = useRouter();
  const [state, setState] = useState<ToastState>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onUndo = (e: Event) => {
      const req = (e as CustomEvent<UndoRequest>).detail;
      if (timer.current) clearTimeout(timer.current);
      setState({ kind: "offer", req });
      timer.current = setTimeout(() => setState({ kind: "idle" }), UNDO_TIMEOUT_MS);
    };
    window.addEventListener(UNDO_EVENT, onUndo);
    return () => {
      window.removeEventListener(UNDO_EVENT, onUndo);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (state.kind === "idle") return null;
  const { req } = state;

  async function undo() {
    if (state.kind !== "offer") return;
    if (timer.current) clearTimeout(timer.current);
    setState({ kind: "restoring", req });
    const ok = await req.restore();
    if (ok) {
      setState({ kind: "idle" });
      req.onRestored?.();
      router.refresh();
      return;
    }
    setState({ kind: "failed", req });
    timer.current = setTimeout(() => setState({ kind: "idle" }), 8_000);
  }

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span>
        {state.kind === "failed"
          ? "Could not restore it — try Settings → Trash."
          : req.message}
      </span>
      {state.kind === "failed" ? (
        <Link href="/settings#trash" className={styles.link}>
          Open Trash
        </Link>
      ) : (
        <button
          className={styles.undo}
          onClick={() => void undo()}
          disabled={state.kind === "restoring"}
        >
          {state.kind === "restoring" ? "Restoring…" : "Undo"}
        </button>
      )}
      <button
        className={styles.dismiss}
        onClick={() => setState({ kind: "idle" })}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
