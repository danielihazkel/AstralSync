import type { Metadata, Viewport } from "next";
import Link from "next/link";
import LlmDisclosure from "@/components/llm/LlmDisclosure";
import SiteNav from "@/components/nav/SiteNav";
import { NotificationScheduler } from "@/components/pwa/NotificationScheduler";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import GlobalShortcuts from "@/components/shortcuts/GlobalShortcuts";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { UndoToast } from "@/components/undo/UndoToast";
import { THEME_COLOR } from "@/lib/pwa/manifest";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AstralSync", template: "%s · AstralSync" },
  description: "Natal charts and numerology, fully offline.",
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeScript />
        <ServiceWorkerRegistration />
        <a href="#content" className="skipLink">
          Skip to content
        </a>
        <header className="siteHeader">
          <Link href="/" className="siteBrand">
            ✶ AstralSync
          </Link>
          <SiteNav />
        </header>
        <div id="content" tabIndex={-1} className="siteContent">
          {children}
        </div>
        <UndoToast />
        <LlmDisclosure />
        <GlobalShortcuts />
        <NotificationScheduler />
      </body>
    </html>
  );
}
