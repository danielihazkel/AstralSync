import type { Metadata } from "next";
import EphemerisTable from "@/components/ephemeris/EphemerisTable";

export const metadata: Metadata = {
  title: "Ephemeris",
  description:
    "Daily planetary positions at 0h UT, with ingresses and stations, month by month.",
};

/**
 * Profile-independent ephemeris table: a static shell around a client
 * component that computes everything in-browser from the bundled engine
 * (the Sky Calendar pattern), so this page works offline.
 */
export default function EphemerisPage() {
  return (
    <main>
      <h1>Ephemeris</h1>
      <EphemerisTable />
    </main>
  );
}
