import type { Road } from "./types";

export interface RoadSpawn {
  x: number;
  z: number;
  yaw: number;
  road: Road;
}

const MARINA_PREFERENCE_RADIUS = 350;

/** Find an open road near the configured start, preferring a nearby Marina street. */
export function findRoadSpawn(roads: Road[], targetX: number, targetZ: number): RoadSpawn | null {
  let nearest: (RoadSpawn & { distance: number }) | null = null;
  let marina: (RoadSpawn & { distance: number }) | null = null;

  for (const road of roads) {
    if (road.foot || road.bridge) continue;
    for (let i = 0; i + 3 < road.pts.length; i += 2) {
      const x1 = road.pts[i];
      const z1 = road.pts[i + 1];
      const dx = road.pts[i + 2] - x1;
      const dz = road.pts[i + 3] - z1;
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((targetX - x1) * dx + (targetZ - z1) * dz) / lengthSquared));
      const x = x1 + t * dx;
      const z = z1 + t * dz;
      const distance = Math.hypot(targetX - x, targetZ - z);
      const candidate = {
        x,
        z,
        yaw: Math.atan2(-dx, -dz),
        road,
        distance,
      };

      if (!nearest || distance < nearest.distance) nearest = candidate;
      if (
        road.name?.toLowerCase().includes("marina") &&
        distance <= MARINA_PREFERENCE_RADIUS &&
        (!marina || distance < marina.distance)
      ) {
        marina = candidate;
      }
    }
  }

  return marina ?? nearest;
}