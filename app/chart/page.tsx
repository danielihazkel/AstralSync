import type { Metadata } from "next";
import { Suspense } from "react";
import MomentChart from "@/components/moment/MomentChart";

export const metadata: Metadata = {
  title: "Chart of the moment",
  description:
    "Cast a chart for any date, time and place — an event, a question, the sky right now.",
};

/**
 * Profile-free chart casting: a static shell around a client component that
 * computes in the browser (the ephemeris pattern). The Suspense boundary is
 * for useSearchParams — the moment lives in the URL.
 */
export default function ChartPage() {
  return (
    <main>
      <h1>Chart of the moment</h1>
      <Suspense>
        <MomentChart />
      </Suspense>
    </main>
  );
}
