/**
 * Optional vehicles module (not built yet).
 *
 * Plan: a VehicleController registers here. On "F" near a vehicle the game
 * sets `controlledBy = "vehicle"`, renders <Player active={false} />, and the
 * vehicle reads input from player/input.ts. Exiting restores the on-foot
 * controller at the door position. Nothing in player/ needs to change.
 */
export interface VehicleDef {
  id: string;
  kind: "danfo" | "car" | "okada" | "keke";
  position: [number, number, number];
  yaw: number;
}

export interface VehicleModule {
  vehicles: VehicleDef[];
  enter(id: string): void;
  exit(): void;
}

export const vehicles: VehicleModule | null = null;
