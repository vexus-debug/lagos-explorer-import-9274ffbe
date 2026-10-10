/** Splits processed data into TILE_SIZE tiles (roads are cut into per-tile pieces). */
import { TILE_SIZE, tileKey } from "./config";
import { centroid } from "./geom";
import type { Area, Building, MapData, Road } from "./types";

export interface TileFeatures {
  key: string;
  i: number;
  j: number;
  roads: Road[];
  buildings: Building[];
  parks: Area[];
  water: Area[];
}

export function buildTileIndex(data: MapData) {
  const tiles = new Map<string, TileFeatures>();
  const get = (i: number, j: number) => {
    const k = tileKey(i, j);
    let t = tiles.get(k);
    if (!t) tiles.set(k, (t = { key: k, i, j, roads: [], buildings: [], parks: [], water: [] }));
    return t;
  };
  const at = (x: number, z: number) => get(Math.floor(x / TILE_SIZE), Math.floor(z / TILE_SIZE));

  for (const r of data.roads) {
    const n = r.pts.length / 2;
    let start = 0;
    let cur: TileFeatures | null = null;
    for (let s = 0; s < n - 1; s++) {
      const mx = (r.pts[s * 2] + r.pts[s * 2 + 2]) / 2, mz = (r.pts[s * 2 + 1] + r.pts[s * 2 + 3]) / 2;
      const t = at(mx, mz);
      if (cur && t !== cur) {
        cur.roads.push(slice(r, start, s));
        start = s;
      }
      cur = t;
    }
    if (cur) cur.roads.push(slice(r, start, n - 1));
  }
  for (const b of data.buildings) {
    const [x, z] = centroid(b.pts);
    at(x, z).buildings.push(b);
  }
  for (const p of data.parks) {
    const [x, z] = centroid(p.pts);
    at(x, z).parks.push(p);
  }
  for (const w of data.water) {
    const [x, z] = centroid(w.pts);
    at(x, z).water.push(w);
  }
  return tiles;
}

function slice(r: Road, a: number, b: number): Road {
  return { ...r, pts: r.pts.slice(a * 2, b * 2 + 2), elev: r.elev?.slice(a, b + 1) };
}
