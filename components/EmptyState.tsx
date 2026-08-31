import Link from "next/link";
import styles from "./EmptyState.module.css";

/**
 * The shared empty-state card: a quiet glyph, a one-line headline, an
 * optional explanation and an optional way forward. Server-safe (no hooks),
 * so both server pages and client panels compose it.
 */
export default function EmptyState({
  glyph = "✶",
  title,
  hint,
  action,
}: {
  glyph?: string;
  title: string;
  hint?: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className={styles.empty} role="status">
      <p className={styles.glyph} aria-hidden="true">
        {glyph}
      </p>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
      {action && (
        <p className={styles.hint}>
          <Link href={action.href} className={styles.action}>
            {action.label}
          </Link>
        </p>
      )}
    </div>
  );
}
