import type { Metadata } from "next";
import SettingsPanel from "@/components/settings/SettingsPanel";

export const metadata: Metadata = {
  title: "Settings",
  description: "Theme, orbs, home location and chart preferences.",
};

export default function SettingsPage() {
  return (
    <main>
      <h1>Settings</h1>
      <SettingsPanel />
    </main>
  );
}
