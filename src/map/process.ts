/**
 * Overpass fetching + conversion of raw OSM elements into MapData.
 * Pure (fetch only) so it can also run from scripts/build-map.ts under bun.
 */
import { BBOX, CACHE_VERSION, CBD_LATLON, SUB_BOX_COLS, SUB_BOX_ROWS, bboxMeters, project } from "./config";
import { clipRing, mulberry32, signedArea } from "./geom";
import type { Area, Building, MapData, Road } from "./types";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

type LatLon = { lat: number; lon: number };
interface OsmEl {
  type: "way" | "relation" | "node";
  id: number;
  tags?: Record<string, string>;
  geometry?: (LatLon | null)[];
  members?: { type: string; role: string; geometry?: (LatLon | null)[] }[];
}

export function subBoxes() {
  const out: { s: number; w: number; n: number; e: number }[] = [];
  const dLat = (BBOX.north - BBOX.south) / SUB_BOX_ROWS;
  const dLon = (BBOX.east - BBOX.west) / SUB_BOX_COLS;
  for (let r = 0; r < SUB_BOX_ROWS; r++)
    for (let c = 0; c < SUB_BOX_COLS; c++)
      out.push({ s: BBOX.south + r * dLat, n: BBOX.south + (r + 1) * dLat, w: BBOX.west + c * dLon, e: BBOX.west + (c + 1) * dLon });
  return out;
}

function featureQuery(b: { s: number; w: number; n: number; e: number }) {
  const bb = `${b.s},${b.w},${b.n},${b.e}`;
  return `[out:json][timeout:120];(way["highway"](${bb});way["building"](${bb});way["natural"="water"](${bb});way["leisure"~"^(park|garden|pitch)$"](${bb});way["landuse"~"^(grass|recreation_ground|village_green)$"](${bb}););out tags geom;`;
}
function islandQuery() {
  const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  return `[out:json][timeout:120];(relation["place"~"^(island|islet)$"](${bb});way["place"~"^(island|islet)$"](${bb}););out tags geom;`;
}

async function runQuery(q: string): Promise<OsmEl[]> {
  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          body: "data=" + encodeURIComponent(q),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        const json = await res.json();
        return json.elements as OsmEl[];
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  throw lastErr;
}

export async function fetchOverpass(onProgress: (done: number, total: number, label: string) => void) {
  const boxes = subBoxes();
  const total = boxes.length + 1;
  const all = new Map<string, OsmEl>();
  for (let i = 0; i < boxes.length; i++) {
    onProgress(i, total, `Downloading streets & buildings (${i + 1}/${boxes.length})`);
    const els = await runQuery(featureQuery(boxes[i]));
    for (const el of els) all.set(el.type + el.id, el);
  }
  onProgress(boxes.length, total, "Downloading shorelines");
  try {
    for (const el of await runQuery(islandQuery())) all.set(el.type + el.id, el);
  } catch {
    /* land falls back to the whole bbox */
  }
  onProgress(total, total, "Processing map");
  return processElements([...all.values()]);
}

const ROAD_WIDTH: Record<string, number> = {
  motorway: 14, trunk: 12, primary: 11, secondary: 9, tertiary: 8,
  motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7,
  residential: 6, unclassified: 6, living_street: 5, service: 4, track: 3,
  pedestrian: 5, footway: 2.4, path: 2, steps: 2.4, cycleway: 2.4, corridor: 2,
};
const FOOT = new Set(["footway", "path", "steps", "pedestrian", "cycleway", "corridor", "bridleway"]);
const PALETTE = [0xc9b79c, 0xb8a58a, 0xd6cbb5, 0xa89f91, 0xc4a484, 0xbfae95, 0x9fa8a3, 0xd1c2a5, 0xb5927a, 0xa7b0b8, 0xcfc6b8, 0x9c8f7e];

const toPts = (geom: (LatLon | null)[]) => {
  const pts: number[] = [];
  for (const g of geom) {
    if (!g) continue;
    const [x, z] = project(g.lat, g.lon);
    pts.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
  }
  return pts;
};
const closedRing = (pts: number[]) => {
  const n = pts.length;
  if (n >= 4 && pts[0] === pts[n - 2] && pts[1] === pts[n - 1]) return pts.slice(0, n - 2);
  return pts;
};

function assembleRings(ways: number[][]): number[][] {
  const eq = (a: number[], i: number, b: number[], j: number) => Math.abs(a[i] - b[j]) < 0.2 && Math.abs(a[i + 1] - b[j + 1]) < 0.2;
  const pool = ways.filter((w) => w.length >= 4).map((w) => w.slice());
  const rings: number[][] = [];
  while (pool.length) {
    let cur = pool.shift()!;
    let guard = 0;
    while (!eq(cur, 0, cur, cur.length - 2) && guard++ < 5000) {
      const e = cur.length - 2;
      const idx = pool.findIndex((w) => eq(w, 0, cur, e) || eq(w, w.length - 2, cur, e));
      if (idx < 0) break;
      const w = pool.splice(idx, 1)[0];
      if (eq(w, 0, cur, e)) cur = cur.concat(w.slice(2));
      else {
        const rev: number[] = [];
        for (let i = w.length - 4; i >= 0; i -= 2) rev.push(w[i], w[i + 1]);
        cur = cur.concat(rev);
      }
    }
    if (eq(cur, 0, cur, cur.length - 2)) rings.push(closedRing(cur));
  }
  return rings;
}

export function processElements(els: OsmEl[]): MapData {
  const bb = bboxMeters();
  const pad = 50;
  const [cx, cz] = project(CBD_LATLON.lat, CBD_LATLON.lon);
  const roads: Road[] = [];
  const buildings: Building[] = [];
  const water: Area[] = [];
  const parks: Area[] = [];
  const land: Area[] = [];

  for (const el of els) {
    const t = el.tags ?? {};
    if (el.type === "way" && el.geometry) {
      const pts = toPts(el.geometry);
      if (pts.length < 4) continue;
      if (t.highway) {
        const kind = t.highway;
        if (kind === "construction" || kind === "proposed" || kind === "platform") continue;
        const foot = FOOT.has(kind) || t.footway === "sidewalk";
        const width = ROAD_WIDTH[kind] ?? 5;
        roads.push({ id: el.id, pts, kind, width, name: t.name, bridge: t.bridge === "yes" || t.bridge === "viaduct", foot });
      } else if (t.building) {
        const ring = closedRing(pts);
        if (ring.length < 6) continue;
        const rnd = mulberry32(el.id);
        let h = parseFloat(t.height);
        if (!(h > 0) && t["building:levels"]) h = parseFloat(t["building:levels"]) * 3;
        const area = Math.abs(signedArea(ring));
        let roof: "flat" | "slant" = "flat";
        if (!(h > 0)) {
          let mx = 0, mz = 0;
          for (let i = 0; i < ring.length; i += 2) { mx += ring[i]; mz += ring[i + 1]; }
          mx /= ring.length / 2; mz /= ring.length / 2;
          const d = Math.hypot(mx - cx, mz - cz);
          const center = Math.max(0, 1 - d / 2200);
          h = (8 + rnd() * 17) * (0.6 + 0.9 * center);
          if (center > 0.55 && area > 400 && rnd() < 0.12) h += 25 + rnd() * 45;
          if (area < 220 && rnd() < 0.4) { roof = "slant"; h = Math.min(h, 9); }
        }
        buildings.push({ id: el.id, pts: ring, h: Math.round(Math.min(h, 160) * 10) / 10, roof, color: PALETTE[Math.floor(rnd() * PALETTE.length)] });
      } else if (t.natural === "water") {
        water.push({ pts: closedRing(pts) });
      } else if (t.leisure || t.landuse) {
        parks.push({ pts: closedRing(pts), name: t.name });
      } else if (t.place) {
        const r = clipRing(closedRing(pts), bb.minX - pad, bb.minZ - pad, bb.maxX + pad, bb.maxZ + pad);
        if (r.length >= 6) land.push({ pts: r, name: t.name });
      }
    } else if (el.type === "relation" && t.place && el.members) {
      const outer = assembleRings(el.members.filter((m) => m.role !== "inner" && m.geometry).map((m) => toPts(m.geometry!)));
      const inner = assembleRings(el.members.filter((m) => m.role === "inner" && m.geometry).map((m) => toPts(m.geometry!)));
      for (const o of outer) {
        const r = clipRing(o, bb.minX - pad, bb.minZ - pad, bb.maxX + pad, bb.maxZ + pad);
        if (r.length < 6) continue;
        const holes = inner.map((h) => clipRing(h, bb.minX - pad, bb.minZ - pad, bb.maxX + pad, bb.maxZ + pad)).filter((h) => h.length >= 6);
        land.push({ pts: r, holes, name: t.name });
      }
    }
  }

  // Bridges: elevation profile ramps up from both ends.
  for (const r of roads) {
    if (!r.bridge) continue;
    const n = r.pts.length / 2;
    const s = [0];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(r.pts[i * 2] - r.pts[i * 2 - 2], r.pts[i * 2 + 1] - r.pts[i * 2 - 1]));
    const total = s[n - 1];
    const peak = Math.min(6, total * 0.08);
    r.elev = s.map((d) => Math.round(Math.min(peak, d * 0.1, (total - d) * 0.1) * 100) / 100);
  }

  if (!land.length) land.push({ pts: [bb.minX, bb.minZ, bb.maxX, bb.minZ, bb.maxX, bb.maxZ, bb.minX, bb.maxZ] });
  return { version: CACHE_VERSION, bbox: BBOX, source: "overpass", roads, buildings, water, parks, land };
}

/** Offline fallback: a small procedural grid city so the game is always playable. */
export function proceduralCity(): MapData {
  const rnd = mulberry32(42);
  const roads: Road[] = [];
  const buildings: Building[] = [];
  const S = 700, step = 90;
  let id = 1;
  for (let v = -S; v <= S; v += step) {
    const main = v % (step * 3) === 0;
    const kind = main ? "primary" : "residential";
    roads.push({ id: id++, pts: [v, -S, v, S], kind, width: ROAD_WIDTH[kind], bridge: false, foot: false, name: main ? `Broad Street ${v}` : undefined });
    roads.push({ id: id++, pts: [-S, v, S, v], kind, width: ROAD_WIDTH[kind], bridge: false, foot: false, name: main ? "Marina" : undefined });
  }
  for (let x = -S; x < S; x += step)
    for (let z = -S; z < S; z += step)
      for (let k = 0; k < 4; k++) {
        const bx = x + 12 + (k % 2) * 36, bz = z + 12 + Math.floor(k / 2) * 36;
        const w = 22 + rnd() * 8, d = 22 + rnd() * 8;
        buildings.push({ id: id++, pts: [bx, bz, bx + w, bz, bx + w, bz + d, bx, bz + d], h: 8 + rnd() * 30, roof: rnd() < 0.2 ? "slant" : "flat", color: PALETTE[Math.floor(rnd() * PALETTE.length)] });
      }
  return { version: CACHE_VERSION, bbox: BBOX, source: "procedural", roads, buildings, water: [], parks: [], land: [{ pts: [-S - 40, -S - 40, S + 40, -S - 40, S + 40, S + 40, -S - 40, S + 40] }] };
}
