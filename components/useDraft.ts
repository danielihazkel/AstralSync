"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";

/**
 * A composer's state, mirrored to localStorage under `key` so it survives
 * the panel unmounting (a tab switch) and a reload. Starts empty on the
 * server and the first client render, then restores the stored draft after
 * mount — no hydration mismatch. Writes happen in the setter, never in an
 * effect, so a remount (or StrictMode's double effects) cannot overwrite
 * the stored draft with the empty first render. An empty value removes the
 * stored copy.
 */
export function useDraft<T>(
  key: string,
  empty: T,
  parse: (raw: unknown) => T | null,
  isEmpty: (value: T) => boolean,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(empty);
  const current = useRef<T>(empty);

  useEffect(() => {
    const restored = loadDraft(key, parse) ?? empty;
    current.current = restored;
    setValue(restored);
    // `empty` and `parse` are module constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const v =
        typeof next === "function" ? (next as (prev: T) => T)(current.current) : next;
      current.current = v;
      setValue(v);
      if (isEmpty(v)) clearDraft(key);
      else saveDraft(key, v);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, update];
}
