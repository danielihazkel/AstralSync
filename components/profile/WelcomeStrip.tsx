"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./profile.module.css";

/**
 * The one-time "what next" strip after the wizard creates a chart
 * (`?welcome=1`): the chart is what the page opens on, so point at the
 * three places a new user would not find by themselves. Dismissing drops
 * the parameter, so a reload or a bookmark never shows it again.
 */
export default function WelcomeStrip({ profileId }: { profileId: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  if (params.get("welcome") !== "1") return null;

  const dismiss = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("welcome");
    const q = next.toString();
    router.replace(q ? `${path}?${q}` : path, { scroll: false });
  };

  const tab = (slug: string) => `/profiles/${profileId}?tab=${slug}`;
  return (
    <aside className={styles.welcome} aria-label="Your chart is ready">
      <p>
        <strong>Your chart is ready.</strong> Next: the{" "}
        <Link href={tab("reading")}>Reading</Link> puts it into words,{" "}
        <Link href={tab("transits")}>Transits</Link> shows what the sky is doing
        to it now, and the <Link href={tab("forecast")}>Forecast</Link> looks
        at the week and month ahead. Ctrl+K finds everything else.
      </p>
      <button type="button" onClick={dismiss} className={styles.welcomeDismiss}>
        Got it
      </button>
    </aside>
  );
}
