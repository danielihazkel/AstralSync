"use client";

import dynamic from "next/dynamic";
import { WheelSkeleton } from "./WheelSkeleton";

/**
 * Client-side lazy wrapper for ChartWheel. Server components must import
 * this instead of calling next/dynamic themselves — a Server Component
 * dynamically importing a Client Component does not code-split.
 */
const LazyChartWheel = dynamic(() => import("./ChartWheel"), {
  loading: () => <WheelSkeleton />,
});

export default LazyChartWheel;
