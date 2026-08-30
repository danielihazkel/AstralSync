/**
 * Same-tab event bus for the Undo toast (components/undo/UndoToast.tsx,
 * mounted once in the root layout). A destructive action that has moved
 * something to the Trash announces itself here; the toast offers Undo for a
 * while and calls `restore` if taken. Decoupled by event so buttons that
 * unmount right after deleting (the row they lived in is gone) can still
 * offer an undo.
 */

export const UNDO_EVENT = "astralsync:undo";

/** How long the Undo stays available, in ms. */
export const UNDO_TIMEOUT_MS = 30_000;

export interface UndoRequest {
  /** "Deleted “Mom”", "Note moved to the Trash" — past tense, short. */
  message: string;
  /** Put it back. Resolve true on success; false shows a failure note. */
  restore: () => Promise<boolean>;
  /** Called after a successful restore (typically router.refresh). */
  onRestored?: () => void;
}

export function announceUndo(req: UndoRequest): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<UndoRequest>(UNDO_EVENT, { detail: req }));
}

/** Restore one trashed item via the Trash API — the common `restore`. */
export async function restoreFromTrash(
  kind: "profile" | "journal" | "reading",
  id: number,
): Promise<boolean> {
  const res = await fetch("/api/trash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restore", kind, id }),
  }).catch(() => null);
  return res?.ok === true;
}
