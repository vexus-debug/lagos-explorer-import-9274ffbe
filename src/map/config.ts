/**
 * Map configuration. Change BBOX to explore another area, then click
 * "Rebuild map" on the landing screen (or bump CACHE_VERSION) to refetch.
 */
export const BBOX = { south: 6.425, west: 3.37, north: 6.47, east: 3.43 };

/** Sub-box grid used for Overpass requests (cols x rows = 6 requests). */
export const SUB_BOX_COLS = 3;
export const SUB_BOX_ROWS = 2;

/** Bump to invalidate every cached map in IndexedDB. */
export const CACHE_VERSION = 3;

/** Spawn near Marina; the nearest road (preferring "Marina") is used. */
export const SPAWN_LATLON = { lat: 6.4502, lon: 3.3925 };
/** Business district centre – buildings grow taller near here. */
export const CBD_LATLON = { lat: 6.4545, lon: 3.388 };

export const TILE_SIZE = 200;
export const LOAD_RADIUS = 400;
export const UNLOAD_RADIUS = 600;
export const DETAIL_RADIUS = 150;

const LAT0 = (BBOX.south + BBOX.north) / 2;
const LON0 = (BBOX.west + BBOX.east) / 2;
const MX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const MZ = 110540;

/** Equirectangular projection: lat/lon -> local metres. +x east, -z north. */
export function project(lat: number, lon: number): [number, number] {
  return [(lon - LON0) * MX, -(lat - LAT0) * MZ];
}
export function unproject(x: number, z: number): { lat: number; lon: number } {
  return { lat: LAT0 - z / MZ, lon: LON0 + x / MX };
}

export function bboxMeters() {
  const [minX, minZ] = project(BBOX.north, BBOX.west);
  const [maxX, maxZ] = project(BBOX.south, BBOX.east);
  return { minX, minZ, maxX, maxZ };
}

export const tileKey = (i: number, j: number) => `${i},${j}`;
export const tileOf = (x: number, z: number) =>
  [Math.floor(x / TILE_SIZE), Math.floor(z / TILE_SIZE)] as const;
