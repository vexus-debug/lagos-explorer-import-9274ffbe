// Pre-bakes public/lagos-island.json from Overpass:  bun scripts/build-map.ts
import { writeFileSync } from "node:fs";
import { fetchOverpass } from "../src/map/process";

const data = await fetchOverpass((d, t, l) => console.log(`[${d}/${t}] ${l}`));
writeFileSync("public/lagos-island.json", JSON.stringify(data));
console.log(`roads ${data.roads.length}, buildings ${data.buildings.length}, land ${data.land.length}, water ${data.water.length}, parks ${data.parks.length}`);
