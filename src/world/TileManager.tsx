/**
 * Streams tiles around the player: build within the load radius (in a Web
 * Worker), drop beyond UNLOAD_RADIUS, show props/facade detail only nearby.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { DETAIL_RADIUS, TILE_SIZE, UNLOAD_RADIUS, tileKey, tileOf } from "../map/config";
import { qualityConfig, useGame } from "../store/game";
import type { TileMesh } from "./buildTile";
import { Tile } from "./Tile";
import { worldState } from "./worldState";

const rectDist = (x: number, z: number, i: number, j: number) => {
  const x0 = i * TILE_SIZE, z0 = j * TILE_SIZE;
  const dx = Math.max(x0 - x, 0, x - (x0 + TILE_SIZE));
  const dz = Math.max(z0 - z, 0, z - (z0 + TILE_SIZE));
  return Math.hypot(dx, dz);
};

export function TileManager() {
  const [tiles, setTiles] = useState<Record<string, TileMesh>>({});
  const [detail, setDetail] = useState<string>("");
  const inflight = useRef(new Set<string>());
  const acc = useRef(1);
  const quality = useGame((s) => s.settings.quality);
  const q = qualityConfig(quality);

  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    const worker = new Worker(new URL("../workers/tileBuilder.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<TileMesh>) => {
      const m = e.data;
      inflight.current.delete(m.key);
      const f = worldState.index?.get(m.key);
      if (!f) return;
      worldState.loaded.set(m.key, { features: f, lamps: m.lamps });
      setTiles((prev) => ({ ...prev, [m.key]: m }));
    };
    return () => {
      if (workerRef.current === worker) workerRef.current = null;
      inflight.current.clear();
      worker.terminate();
    };
  }, []);

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;
    const idx = worldState.index;
    if (!idx) return;
    const { x, z } = worldState.playerPos;
    const [pi, pj] = tileOf(x, z);
    const r = Math.ceil(q.load / TILE_SIZE) + 1;
    const wanted: [string, number][] = [];
    for (let i = pi - r; i <= pi + r; i++)
      for (let j = pj - r; j <= pj + r; j++) {
        const k = tileKey(i, j);
        const d = rectDist(x, z, i, j);
        if (d <= q.load && idx.has(k) && !worldState.loaded.has(k) && !inflight.current.has(k)) wanted.push([k, d]);
      }
    wanted.sort((a, b) => a[1] - b[1]);
    const worker = workerRef.current;
    if (worker) for (const [k] of wanted) {
      if (inflight.current.size >= 2) break;
      inflight.current.add(k);
      worker.postMessage(idx.get(k));
    }
    // Unload far tiles
    const remove: string[] = [];
    for (const k of worldState.loaded.keys()) {
      const [i, j] = k.split(",").map(Number);
      if (rectDist(x, z, i, j) > UNLOAD_RADIUS) remove.push(k);
    }
    if (remove.length) {
      for (const k of remove) worldState.loaded.delete(k);
      setTiles((prev) => {
        const n = { ...prev };
        for (const k of remove) delete n[k];
        return n;
      });
    }
    // Detail set
    const near: string[] = [];
    for (const k of worldState.loaded.keys()) {
      const [i, j] = k.split(",").map(Number);
      if (rectDist(x, z, i, j) <= DETAIL_RADIUS) near.push(k);
    }
    const sig = near.sort().join("|");
    if (sig !== detail) setDetail(sig);

    const st = useGame.getState();
    const spawnKey = tileKey(...tileOf(worldState.spawn[0], worldState.spawn[2]));
    if (!st.worldReady && (worldState.loaded.has(spawnKey) || !idx.has(spawnKey))) st.set({ worldReady: true });
    if (st.debug.tiles !== worldState.loaded.size) st.set({ debug: { ...st.debug, tiles: worldState.loaded.size } });
  });

  const detailSet = useMemo(() => new Set(detail.split("|")), [detail]);
  return (
    <>
      {Object.values(tiles).map((m) => (
        <Tile key={m.key} mesh={m} detailed={detailSet.has(m.key)} shadows={q.shadows} />
      ))}
    </>
  );
}
