"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/** The header's destinations. "Sky now" is the chart of the moment — not
 *  a person's natal chart, which lives under Profiles. */
export const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/", label: "Profiles" },
  { href: "/synastry", label: "Synastry" },
  { href: "/journal", label: "Journal" },
  { href: "/calendar", label: "Calendar" },
  { href: "/ephemeris", label: "Ephemeris" },
  { href: "/chart", label: "Sky now" },
  { href: "/onboarding", label: "New profile" },
  { href: "/settings", label: "Settings" },
];

/** Whether `href` is the section the current path sits in: Profiles owns
 *  `/` and every profile page; the rest own their prefix. */
export function isCurrentSection(href: string, path: string): boolean {
  if (href === "/") return path === "/" || path.startsWith("/profiles");
  return path === href || path.startsWith(`${href}/`);
}

/**
 * The site navigation. On wide screens every link shows in a row; on a
 * phone the row collapses behind a Menu button (it used to wrap into two or
 * three rows of links). The current section carries aria-current.
 */
export default function SiteNav() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const listId = useId();

  // A navigation closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <nav className="siteNav" aria-label="Main">
      <button
        type="button"
        className="siteNavToggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Close" : "Menu"}
      </button>
      <div id={listId} className="siteNavLinks" data-open={open || undefined}>
        {NAV_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isCurrentSection(l.href, path) ? "page" : undefined}
          >
            {l.label}
          </Link>
        ))}
        <ThemeToggle />
      </div>
    </nav>
  );
}
