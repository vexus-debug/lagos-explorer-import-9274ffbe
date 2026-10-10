/**
 * Map loading order:
 *   1. IndexedDB cache (unless rebuilding)
 *   2. /lagos-island.json bundled in public/ (unless rebuilding)
 *   3. Overpass API in sub-boxes (first visit / "Rebuild map")
 *   4. Procedural fallback city if everything fails
 */
import { BBOX, CACHE_VERSION } from "./config";
import { idbGet, idbSet } from "./cache";
import { fetchOverpass, proceduralCity } from "./process";
import type { MapData } from "./types";

const KEY = `map:${CACHE_VERSION}:${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
type Progress = (done: number, total: number, label: string) => void;

const valid = (d: MapData | undefined): d is MapData =>
  !!d && d.version === CACHE_VERSION && d.bbox?.south === BBOX.south && d.bbox?.east === BBOX.east && Array.isArray(d.roads);

export async function loadMapData(onProgress: Progress, rebuild = false): Promise<MapData> {
  if (!rebuild) {
    onProgress(0, 1, "Checking saved map");
    try {
      const cached = await idbGet<MapData>(KEY);
      if (valid(cached)) return cached;
    } catch { /* ignore */ }
    try {
      onProgress(0, 1, "Loading bundled map file");
      const res = await fetch("/lagos-island.json");
      if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) {
        const d = (await res.json()) as MapData;
        if (valid(d)) {
          d.source = "file";
          idbSet(KEY, d).catch(() => {});
          return d;
        }
      }
    } catch { /* ignore */ }
  }
  try {
    const d = await fetchOverpass(onProgress);
    await idbSet(KEY, d).catch(() => {});
    return d;
  } catch (e) {
    console.warn("Overpass failed, using procedural city", e);
    onProgress(1, 1, "Map service unavailable – using a generated city");
    return proceduralCity();
  }
}
