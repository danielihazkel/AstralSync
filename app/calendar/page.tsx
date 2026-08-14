import type { Metadata } from "next";
import SkyCalendar from "@/components/calendar/SkyCalendar";

export const metadata: Metadata = {
  title: "Sky Calendar",
  description:
    "Moon signs, phases, void-of-course windows and good-timing windows, month by month.",
};

/**
 * Profile-independent sky calendar: a static shell around a client
 * component that computes everything in-browser from the bundled engines
 * (the Today-dashboard pattern), so this page works offline.
 */
export default function CalendarPage() {
  return (
    <main>
      <h1>Sky Calendar</h1>
      <SkyCalendar />
    </main>
  );
}
