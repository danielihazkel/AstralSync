"use client";

import dynamic from "next/dynamic";
import { WheelSkeleton } from "@/components/chart/WheelSkeleton";

/**
 * Client-side lazy wrapper for BiWheel, for the synastry page (a server
 * component — next/dynamic only code-splits from client modules).
 */
const LazyBiWheel = dynamic(() => import("./BiWheel"), {
  loading: () => <WheelSkeleton />,
});

export default LazyBiWheel;
