"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  filterCommands,
  paletteCommands,
  type PaletteCommand,
} from "@/lib/shortcuts";
import styles from "./shortcuts.module.css";

/**
 * The Ctrl+K palette: pages, the current profile's tabs, and every saved
 * profile, filtered as you type. Profiles are fetched once per open session
 * of the palette (best effort — offline still lists the static pages).
 */
export default function CommandPalette({
  open,
  path,
  onClose,
}: {
  open: boolean;
  path: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [profiles, setProfiles] = useState<
    Array<{ id: number; displayName: string }>
  >([]);
  const fetched = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
    if (fetched.current) return;
    fetched.current = true;
    fetch("/api/profiles?limit=200")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { profiles?: Array<{ id: number; displayName: string }> } | null) => {
        if (body?.profiles) {
          setProfiles(
            body.profiles.map((p) => ({ id: p.id, displayName: p.displayName })),
          );
        }
      })
      .catch(() => {
        fetched.current = false; // try again next open
      });
  }, [open]);

  if (!open) return null;

  const items = filterCommands(paletteCommands(path, profiles), query);
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  function run(item: PaletteCommand) {
    onClose();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % Math.max(1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + Math.max(1, items.length)) % Math.max(1, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) run(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  const rows = items.map((item, i) => ({
    item,
    index: i,
    header: i === 0 || items[i - 1].group !== item.group ? item.group : null,
  }));

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.palette}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Jump to a page, tab or profile…"
          aria-label="Command palette search"
        />
        {items.length === 0 ? (
          <p className={styles.noMatch}>Nothing matches “{query.trim()}”.</p>
        ) : (
          <ul className={styles.list} role="listbox">
            {rows.map(({ item, index, header }) => (
              <React.Fragment key={`${item.group}-${item.href}-${item.label}`}>
                {header !== null && (
                  <li className={styles.group} role="presentation">
                    {header}
                  </li>
                )}
                <li
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActive(index)}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    className={
                      index === activeIndex
                        ? `${styles.item} ${styles.itemActive}`
                        : styles.item
                    }
                    onClick={() => run(item)}
                  >
                    {item.label}
                  </button>
                </li>
              </React.Fragment>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
