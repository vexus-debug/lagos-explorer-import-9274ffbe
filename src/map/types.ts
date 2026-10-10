/** Processed map data – everything in local metres (flat [x,z,x,z,...]). */
export interface Road {
  id: number;
  pts: number[];
  kind: string;
  width: number;
  name?: string;
  bridge: boolean;
  foot: boolean;
  /** Elevation profile (only bridges) – one value per point. */
  elev?: number[];
}
export interface Building {
  id: number;
  pts: number[];
  h: number;
  roof: "flat" | "slant";
  color: number;
}
export interface Area {
  pts: number[];
  holes?: number[][];
  name?: string;
}
export interface MapData {
  version: number;
  bbox: { south: number; west: number; north: number; east: number };
  source: "overpass" | "file" | "procedural";
  roads: Road[];
  buildings: Building[];
  water: Area[];
  parks: Area[];
  /** Island polygons. Everything outside is lagoon. */
  land: Area[];
}
