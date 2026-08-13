import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { THEME_COLOR } from "@/lib/pwa/manifest";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AstralSync", template: "%s · AstralSync" },
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
        <header className="siteHeader">
          <Link href="/" className="siteBrand">
            ✶ AstralSync
          </Link>
          <nav className="siteNav">
            <Link href="/">Profiles</Link>
            <Link href="/synastry">Synastry</Link>
            <Link href="/onboarding">New profile</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
