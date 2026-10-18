import styles from "./onThisPage.module.css";

export interface PageSection {
  /** The section element's id — the anchor target. */
  id: string;
  label: string;
}

/**
 * "On this page": a wrapping row of anchor links to a long view's sections
 * (the Cycles tab, the synastry pair page, the Reading tab). Plain anchors,
 * so it needs no JavaScript and works in print previews; sections get
 * `scroll-margin-top` from the shared rule in globals.css so a jump doesn't land against
 * the top edge. Renders nothing for fewer than three sections — a short
 * page doesn't need a map.
 */
export default function OnThisPage({ sections }: { sections: PageSection[] }) {
  if (sections.length < 3) return null;
  return (
    <nav className={styles.nav} aria-label="On this page">
      <span className={styles.label}>On this page:</span>
      <ul className={styles.list}>
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`}>{s.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
