/**
 * One-time GeoNames import (PRD §4.3): downloads cities15000 (~30k cities,
 * CC-BY), extracts it, and loads it into the geo_city table.
 *
 * Usage: npm run geo:import   (requires DATABASE_URL and a migrated schema)
 * Re-running is safe: existing geoname_ids are skipped.
 */
import AdmZip from "adm-zip";
import { PrismaClient } from "@prisma/client";

const DUMP_URL = "https://download.geonames.org/export/dump/cities15000.zip";
const BATCH = 1000;

const prisma = new PrismaClient();

console.log(`Downloading ${DUMP_URL} ...`);
const res = await fetch(DUMP_URL);
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
const txt = zip.readAsText("cities15000.txt");
if (!txt) throw new Error("cities15000.txt not found in archive");

// GeoNames TSV columns: 0 geonameid, 1 name, 2 asciiname, 4 lat, 5 lng,
// 8 country code, 10 admin1, 14 population.
const rows = txt
  .split("\n")
  .filter((line) => line.trim().length > 0)
  .map((line) => {
    const c = line.split("\t");
    return {
      geonameId: Number(c[0]),
      name: c[1],
      asciiName: c[2],
      lat: Number(c[4]),
      lng: Number(c[5]),
      countryCode: c[8],
      admin1: c[10] || null,
      population: Number(c[14]) || 0,
    };
  })
  .filter((r) => Number.isFinite(r.geonameId) && r.name);

console.log(`Parsed ${rows.length} cities; inserting ...`);
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const result = await prisma.geoCity.createMany({
    data: rows.slice(i, i + BATCH),
    skipDuplicates: true,
  });
  inserted += result.count;
}
console.log(`Done: ${inserted} inserted, ${rows.length - inserted} already present.`);
await prisma.$disconnect();
