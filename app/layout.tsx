import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { THEME_COLOR } from "@/lib/pwa/manifest";
import "./globals.css";

export const metadata: Metadata = {
  title: "AstralSync",
  description: "Natal charts and numerology, fully offline.",
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        <header
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "0.85rem 1.5rem",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.15rem",
              color: "var(--accent-bright)",
            }}
          >
            ✶ AstralSync
          </Link>
          <nav>
            <Link href="/onboarding" style={{ color: "var(--text-muted)" }}>
              New profile
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
