"use client";

import { useRef } from "react";
import type React from "react";

/**
 * Shared WAI-ARIA tabs behavior for every tab strip (profile tabs, transits
 * Now/Calendar, calendar Moon/Day picker). Selection is controlled by the
 * caller; the hook adds the APG pattern the strips were missing: tab↔panel
 * id linkage, roving tabindex, and ArrowLeft/ArrowRight/Home/End navigation
 * with automatic activation (selection follows focus — every panel here
 * renders instantly, so the APG default applies).
 */

/**
 * Next tab index for a tablist key press, wrapping at both ends; null when
 * the key is not a horizontal-tablist navigation key. Pure so it can run
 * under vitest's node environment (no jsdom in this repo).
 */
export function nextTabIndex(
  key: string,
  current: number,
  count: number,
): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export interface UseTabListOptions {
  count: number;
  /** Index of the selected tab (controlled). */
  selected: number;
  onSelect: (index: number) => void;
  /** Id prefix, e.g. "profile-tabs" → profile-tabs-tab-0 / profile-tabs-panel-0. */
  idBase: string;
}

export function useTabList({ count, selected, onSelect, idBase }: UseTabListOptions) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function getTabProps(index: number) {
    return {
      role: "tab" as const,
      type: "button" as const,
      id: `${idBase}-tab-${index}`,
      "aria-selected": selected === index,
      "aria-controls": `${idBase}-panel-${index}`,
      // Roving tabindex: only the selected tab is in the page tab order.
      tabIndex: selected === index ? 0 : -1,
      ref: (el: HTMLButtonElement | null) => {
        tabRefs.current[index] = el;
      },
      onClick: () => onSelect(index),
      onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
        const next = nextTabIndex(e.key, index, count);
        if (next === null) return;
        e.preventDefault();
        tabRefs.current[next]?.focus();
        onSelect(next);
      },
    };
  }

  function getPanelProps(index: number) {
    return {
      role: "tabpanel" as const,
      id: `${idBase}-panel-${index}`,
      "aria-labelledby": `${idBase}-tab-${index}`,
      // Panels may hold nothing focusable (prose tabs), so the panel itself
      // must be reachable from the strip with one Tab press.
      tabIndex: 0,
    };
  }

  return { getTabProps, getPanelProps };
}
