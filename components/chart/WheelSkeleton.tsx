/**
 * Loading placeholder for the lazily-loaded SVG wheels (ChartWheel, BiWheel,
 * TransitWheel). Fixed 1:1 aspect ratio so the wheel's arrival causes no
 * layout shift; static (no animation) so it needs no reduced-motion guard.
 */
export function WheelSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading chart wheel"
      style={{
        aspectRatio: "1",
        maxWidth: "34rem",
        margin: "0 auto",
        borderRadius: "50%",
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    />
  );
}
