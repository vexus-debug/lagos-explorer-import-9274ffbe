/**
 * Global game state (Zustand). Player state lives in one serialisable shape so
 * a future multiplayer layer can broadcast/receive it unchanged.
 */
import { create } from "zustand";

export type Quality = "low" | "medium" | "high";
export type Vec3 = [number, number, number];

export interface PlayerState {
  id: string;
  name: string;
  position: Vec3;
  rotation: { yaw: number; pitch: number };
  velocity: Vec3;
}

export interface Settings {
  sensitivity: number;
  volume: number;
  quality: Quality;
  headBob: boolean;
}

interface GameStore {
  phase: "menu" | "playing";
  paused: boolean;
  mapReady: boolean;
  worldReady: boolean;
  loading: { done: number; total: number; label: string };
  settings: Settings;
  player: PlayerState;
  hour: number;
  autoTime: boolean;
  streetName: string;
  ui: { minimap: boolean; fullMap: boolean; debug: boolean };
  debug: { fps: number; tiles: number; calls: number; tris: number; peds: number };
  set: (p: Partial<GameStore>) => void;
  setSettings: (p: Partial<Settings>) => void;
  setPlayer: (p: Partial<PlayerState>) => void;
  toggleUi: (k: keyof GameStore["ui"]) => void;
}

const savedSettings = (): Settings => {
  const def: Settings = { sensitivity: 1, volume: 0.6, quality: "medium", headBob: true };
  if (typeof localStorage === "undefined") return def;
  try {
    return { ...def, ...JSON.parse(localStorage.getItem("lagos-settings") || "{}") };
  } catch {
    return def;
  }
};

export const useGame = create<GameStore>((set) => ({
  phase: "menu",
  paused: false,
  mapReady: false,
  worldReady: false,
  loading: { done: 0, total: 1, label: "Starting" },
  settings: savedSettings(),
  player: { id: "local", name: "Player", position: [0, 1, 0], rotation: { yaw: 0, pitch: 0 }, velocity: [0, 0, 0] },
  hour: 17.5,
  autoTime: true,
  streetName: "Lagos Island",
  ui: { minimap: true, fullMap: false, debug: false },
  debug: { fps: 0, tiles: 0, calls: 0, tris: 0, peds: 0 },
  set: (p) => set(p),
  setSettings: (p) =>
    set((s) => {
      const settings = { ...s.settings, ...p };
      try { localStorage.setItem("lagos-settings", JSON.stringify(settings)); } catch { /* ignore */ }
      return { settings };
    }),
  setPlayer: (p) => set((s) => ({ player: { ...s.player, ...p } })),
  toggleUi: (k) => set((s) => ({ ui: { ...s.ui, [k]: !s.ui[k] } })),
}));

export const qualityConfig = (q: Quality) =>
  ({
    low: { dpr: 1, load: 300, fogFar: 260, peds: 15, shadows: false },
    medium: { dpr: 1.5, load: 400, fogFar: 380, peds: 28, shadows: false },
    high: { dpr: 2, load: 450, fogFar: 460, peds: 40, shadows: true },
  })[q];
