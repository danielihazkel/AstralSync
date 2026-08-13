"use client";

/** Triggers the browser print dialog — "Save as PDF" is the export path.
 *  The owner hides it under `@media print`. */
export default function PrintButton({ className }: { className?: string }) {
  return (
    <button className={className} onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}
