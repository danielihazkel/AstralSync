"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  MONTH_SHIFT_EVENT,
  SHORTCUT_HELP,
  resolveShortcut,
  tabHref,
} from "@/lib/shortcuts";
import CommandPalette from "./CommandPalette";
import styles from "./shortcuts.module.css";

/** How long a bare "g" waits for its second key. */
const CHORD_MS = 1500;

/**
 * Layout-mounted keyboard shortcuts: the Ctrl+K palette, the `?` help
 * overlay, `/` search focus, `g <key>` navigation, digit tab switching on a
 * profile page and `[`/`]` month paging on the calendar surfaces. The
 * key→action mapping is pure (lib/shortcuts.ts); this island only wires the
 * DOM events.
 */
export default function GlobalShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The handler must see fresh overlay state without re-binding per change.
  const overlays = useRef({ palette: false, help: false });
  useEffect(() => {
    overlays.current = { palette: paletteOpen, help: helpOpen };
  }, [paletteOpen, helpOpen]);

  useEffect(() => {
    function clearPending() {
      pendingG.current = false;
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    }
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const editable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        !!target?.isContentEditable;
      const action = resolveShortcut(
        {
          key: e.key,
          ctrl: e.ctrlKey,
          meta: e.metaKey,
          alt: e.altKey,
          editable,
        },
        { pendingG: pendingG.current, path: pathname },
      );
      if (action?.type !== "pending-g") clearPending();
      if (action === null) return;
      switch (action.type) {
        case "palette":
          e.preventDefault();
          setHelpOpen(false);
          setPaletteOpen((o) => !o);
          break;
        case "help":
          e.preventDefault();
          setPaletteOpen(false);
          setHelpOpen((o) => !o);
          break;
        case "search": {
          const field = document.querySelector<HTMLInputElement>(
            'input[type="search"]',
          );
          if (field) {
            e.preventDefault();
            field.focus();
            field.select();
          }
          break;
        }
        case "close":
          if (overlays.current.palette || overlays.current.help) {
            e.preventDefault();
            setPaletteOpen(false);
            setHelpOpen(false);
          }
          break;
        case "pending-g":
          pendingG.current = true;
          if (pendingTimer.current) clearTimeout(pendingTimer.current);
          pendingTimer.current = setTimeout(() => {
            pendingG.current = false;
          }, CHORD_MS);
          break;
        case "go":
          e.preventDefault();
          router.push(action.href);
          break;
        case "tab": {
          e.preventDefault();
          // Preserve other params (?version=) by editing the live URL.
          const url = new URL(window.location.href);
          const [, search] = tabHref(url.pathname, action.index).split("?");
          const params = new URLSearchParams(search);
          const tab = params.get("tab");
          if (tab) url.searchParams.set("tab", tab);
          router.push(url.pathname + url.search);
          break;
        }
        case "month":
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent(MONTH_SHIFT_EVENT, {
              detail: { delta: action.delta },
            }),
          );
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearPending();
    };
  }, [pathname, router]);

  return (
    <>
      <CommandPalette
        open={paletteOpen}
        path={pathname}
        onClose={() => setPaletteOpen(false)}
      />
      {helpOpen && (
        <>
          <div
            className={styles.backdrop}
            onClick={() => setHelpOpen(false)}
            aria-hidden="true"
          />
          <div
            className={styles.help}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <h2 className={styles.helpTitle}>Keyboard shortcuts</h2>
            <dl className={styles.helpList}>
              {SHORTCUT_HELP.map((row) => (
                <div key={row.keys} className={styles.helpRow}>
                  <dt className={styles.keys}>{row.keys}</dt>
                  <dd className={styles.helpDesc}>{row.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </>
  );
}
