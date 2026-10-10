/** Spatial queries over map features (street names, footstep surfaces). */
import { tileKey, tileOf } from "../map/config";
import { pointInRing, segDist } from "../map/geom";
import type { Road } from "../map/types";
import type { Surface } from "../audio/audio";
import { worldState } from "./worldState";

export function nearestRoad(x: number, z: number, maxDist = 40, named = false) {
  const idx = worldState.index;
  if (!idx) return null;
  const [ti, tj] = tileOf(x, z);
  let best: Road | null = null, bestD = maxDist;
  for (let i = ti - 1; i <= ti + 1; i++)
    for (let j = tj - 1; j <= tj + 1; j++) {
      const t = idx.get(tileKey(i, j));
      if (!t) continue;
      for (const r of t.roads) {
        if (named && !r.name) continue;
        for (let k = 0; k + 3 < r.pts.length; k += 2) {
          const d = segDist(x, z, r.pts[k], r.pts[k + 1], r.pts[k + 2], r.pts[k + 3]) - r.width / 2;
          if (d < bestD) { bestD = d; best = r; }
        }
      }
    }
  return best ? { road: best, dist: bestD } : null;
}

export function surfaceAt(x: number, z: number, footY: number): Surface {
  if (footY > 0.12) return "concrete";
  const n = nearestRoad(x, z, 0.2);
  if (n && !n.road.foot) return "road";
  const t = worldState.index?.get(tileKey(...tileOf(x, z)));
  if (t) for (const p of t.parks) if (pointInRing(x, z, p.pts)) return "grass";
  return "concrete";
}
