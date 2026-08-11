import { buildChart } from "@astralsync/astro-core";
import { lifePath } from "@astralsync/numero-core";

// Smoke-test page: renders a fixed reference chart server-side to prove the
// core packages are wired into the app. Replaced by real onboarding in Phase 1e.
export default function Home() {
  const chart = buildChart({
    utc: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
    latitude: 51.48,
    longitude: 0,
    houseSystem: "placidus",
    timeCertainty: "exact",
  });
  const lp = lifePath({ year: 2000, month: 1, day: 1 });

  return (
    <main>
      <h1>AstralSync</h1>
      <p className="tagline">
        Natal charts and numerology — fully offline. Scaffolding build.
      </p>
      <section>
        <h2>Engine smoke test — J2000 epoch, Greenwich</h2>
        <dl>
          <dt>Sun</dt>
          <dd>{chart.bigThree.sun}</dd>
          <dt>Moon</dt>
          <dd>{chart.bigThree.moon}</dd>
          <dt>Ascendant</dt>
          <dd>{chart.bigThree.ascendant ?? "—"}</dd>
          <dt>Aspects found</dt>
          <dd>{chart.aspects.length}</dd>
          <dt>Ephemeris</dt>
          <dd>
            {chart.engine.name} v{chart.engine.version}
          </dd>
        </dl>
      </section>
      <section>
        <h2>Numerology smoke test — 2000-01-01</h2>
        <dl>
          <dt>Life Path</dt>
          <dd>
            {lp.value}
            {lp.isMaster ? " (master)" : ""}
          </dd>
        </dl>
      </section>
    </main>
  );
}
