"use client";

/**
 * The root layout itself failed. This replaces the whole document, and the
 * global stylesheet and theme do not reach it, so it carries its own small
 * palette — the dark theme's colours, following the OS scheme for light.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          background: "Canvas",
          color: "CanvasText",
          colorScheme: "dark light",
        }}
      >
        <title>AstralSync — something went wrong</title>
        <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "3rem 1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem" }}>AstralSync could not load</h1>
          <p style={{ opacity: 0.75, margin: "0.75rem 0 1.5rem" }}>
            The app hit an error before it could draw the page.
            {error.digest && <> Reference {error.digest}.</>} Your data is
            untouched.
          </p>
          <button onClick={retry} style={{ font: "inherit", padding: "0.5rem 1rem" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
