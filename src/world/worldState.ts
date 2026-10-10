/**
 * Mutable, non-reactive world state shared between systems that run every
 * frame (player, NPCs, streaming). Kept out of React/Zustand to avoid re-renders.
 */
import type { LandMask } from "../map/landMask";
import type { TileFeatures } from "../map/tiles";
import type { MapData } from "../map/types";

export const worldState = {
  data: null as MapData | null,
  index: null as Map<string, TileFeatures> | null,
  land: null as LandMask | null,
  spawn: [0, 1, 0] as [number, number, number],
  playerPos: { x: 0, y: 1, z: 0 },
  playerYaw: 0,
  /** Tiles currently built: features + lamp positions. */
  loaded: new Map<string, { features: TileFeatures; lamps: Float32Array }>(),
  night: { value: 0 },
};
