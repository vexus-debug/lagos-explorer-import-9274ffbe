import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { SPAWN_LATLON, bboxMeters, project } from "../map/config";
import { LandMask } from "../map/landMask";
import { loadMapData } from "../map/loadMap";
import { buildTileIndex } from "../map/tiles";
import { initAudio, setVolume } from "../audio/audio";
import { attachDesktopInput, input } from "../player/input";
import { MobileControls } from "../player/MobileControls";
import { Player } from "../player/Player";
import { qualityConfig, useGame } from "../store/game";
import { Atmosphere } from "../world/Atmosphere";
import { Ground } from "../world/Ground";
import { TileManager } from "../world/TileManager";
import { worldState } from "../world/worldState";

async function prepare(rebuild: boolean) {
  const g = useGame.getState();
  g.set({ mapReady: false });
  const data = await loadMapData((done, total, label) => useGame.getState().set({ loading: { done, total, label } }), rebuild);
  const bb = bboxMeters();
  worldState.data = data;
  worldState.index = buildTileIndex(data);
  worldState.land = new LandMask(bb.minX - 60, bb.minZ - 60, bb.maxX + 60, bb.maxZ + 60, data.land);
  // Spawn on the road nearest Marina (prefer one named "Marina")
  const [sx, sz] = project(SPAWN_LATLON.lat, SPAWN_LATLON.lon);
  let best = { d: Infinity, x: 0, z: 0, yaw: 0 };
  for (const r of data.roads) {
    if (r.foot || r.bridge) continue;
    const bonus = r.name?.includes("Marina") ? -300 : 0;
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const d = Math.hypot(r.pts[i] - sx, r.pts[i + 1] - sz) + bonus;
      if (d < best.d && worldState.land.isLand(r.pts[i], r.pts[i + 1]))
        best = { d, x: r.pts[i], z: r.pts[i + 1], yaw: Math.atan2(-(r.pts[i + 2] - r.pts[i]), -(r.pts[i + 3] - r.pts[i + 1])) };
    }
  }
  worldState.spawn = [best.x, 1.2, best.z];
  worldState.playerPos = { x: best.x, y: 1.2, z: best.z };
  worldState.playerYaw = best.yaw;
  worldState.loaded.clear();
  useGame.getState().set({ mapReady: true, loading: { done: 1, total: 1, label: `Map ready (${data.source})` } });
}

function DebugProbe() {
  const gl = useThree((s) => s.gl);
  const t = useRef({ acc: 0, frames: 0 });
  useFrame((_, dt) => {
    t.current.acc += dt;
    t.current.frames++;
    if (t.current.acc > 0.5) {
      const g = useGame.getState();
      g.set({ debug: { ...g.debug, fps: Math.round(t.current.frames / t.current.acc), calls: gl.info.render.calls, tris: gl.info.render.triangles } });
      t.current = { acc: 0, frames: 0 };
    }
  });
  return null;
}

function Hud() {
  const { streetName, player, ui, debug, worldReady, hour, autoTime, paused, set, settings } = useGame();
  const heading = ((((-player.rotation.yaw * 180) / Math.PI) % 360) + 360) % 360;
  const dir = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(heading / 45) % 8];
  return (
    <div className="pointer-events-none fixed inset-0 z-10 font-body text-foreground">
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/90" />
      <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-background/70 px-4 py-2 text-center backdrop-blur">
        <div className="font-display text-lg text-primary">{dir} · {Math.round(heading)}°</div>
        <div className="text-xs text-muted-foreground">{streetName}</div>
      </div>
      {ui.debug && (
        <div className="absolute left-4 top-4 rounded bg-background/80 p-2 font-mono text-xs">
          FPS {debug.fps} · tiles {debug.tiles} · calls {debug.calls} · tris {debug.tris}
          <br />x {player.position[0].toFixed(1)} y {player.position[1].toFixed(1)} z {player.position[2].toFixed(1)} · {hour.toFixed(1)}h
        </div>
      )}
      {!worldReady && <div className="absolute inset-0 grid place-items-center bg-background font-display text-2xl">Building the city…</div>}
      {paused && worldReady && (
        <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-background/70 backdrop-blur">
          <div className="w-80 space-y-4 rounded-lg border bg-card p-6">
            <div className="font-display text-2xl">Paused</div>
            <label className="block text-sm">Time of day {hour.toFixed(1)}h
              <input type="range" min={0} max={24} step={0.1} value={hour} onChange={(e) => set({ hour: +e.target.value })} className="w-full accent-primary" />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoTime} onChange={(e) => set({ autoTime: e.target.checked })} /> Day/night cycle</label>
            <SettingsFields />
            <button className="w-full rounded-md bg-primary py-2 font-semibold text-primary-foreground" onClick={() => { set({ paused: false }); if (!input.mobile) document.body.requestPointerLock(); }}>Resume</button>
            <div className="text-xs text-muted-foreground">Quality: {settings.quality}</div>
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-foreground/70">Map data © OpenStreetMap contributors</div>
    </div>
  );
}

function SettingsFields() {
  const { settings, setSettings } = useGame();
  return (
    <div className="space-y-3 text-sm">
      <label className="block">Mouse sensitivity
        <input type="range" min={0.2} max={3} step={0.1} value={settings.sensitivity} onChange={(e) => setSettings({ sensitivity: +e.target.value })} className="w-full accent-primary" />
      </label>
      <label className="block">Volume
        <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => { setSettings({ volume: +e.target.value }); setVolume(+e.target.value); }} className="w-full accent-primary" />
      </label>
      <div className="flex gap-2">
        {(["low", "medium", "high"] as const).map((q) => (
          <button key={q} onClick={() => setSettings({ quality: q })} className={`flex-1 rounded border py-1 capitalize ${settings.quality === q ? "border-primary text-primary" : ""}`}>{q}</button>
        ))}
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={settings.headBob} onChange={(e) => setSettings({ headBob: e.target.checked })} /> Head bob</label>
    </div>
  );
}

export function Game() {
  const { phase, mapReady, loading, set, settings, toggleUi, paused } = useGame();
  const [err, setErr] = useState("");
  useEffect(() => { prepare(false).catch((e) => setErr(String(e))); }, []);
  useEffect(() => {
    const off = attachDesktopInput();
    input.mobile = "ontouchstart" in window;
    const key = (e: KeyboardEvent) => {
      if (e.code === "F3") toggleUi("debug");
      if (e.code === "KeyM") toggleUi("minimap");
    };
    const lock = () => {
      const g = useGame.getState();
      if (g.phase === "playing" && !document.pointerLockElement && !input.mobile) g.set({ paused: true });
    };
    window.addEventListener("keydown", key);
    document.addEventListener("pointerlockchange", lock);
    return () => { off(); window.removeEventListener("keydown", key); document.removeEventListener("pointerlockchange", lock); };
  }, [toggleUi]);

  const play = () => {
    initAudio(settings.volume);
    set({ phase: "playing", paused: false });
    if (!input.mobile) document.body.requestPointerLock();
  };
  const q = qualityConfig(settings.quality);

  if (phase === "menu")
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[radial-gradient(ellipse_at_top,var(--color-accent),var(--color-background))] px-6 font-body text-foreground">
        <div className="text-center">
          <div className="font-display text-6xl tracking-tight text-primary md:text-8xl">ÈKÓ</div>
          <div className="mt-2 text-lg text-muted-foreground">Lagos Island · open-world prototype</div>
        </div>
        <div className="w-full max-w-sm space-y-4 rounded-lg border bg-card/80 p-6 backdrop-blur">
          <button disabled={!mapReady} onClick={play} className="w-full rounded-md bg-primary py-3 font-display text-xl text-primary-foreground disabled:opacity-50">
            {mapReady ? "Play" : "Loading map…"}
          </button>
          <div className="h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(loading.done / loading.total) * 100}%` }} /></div>
          <div className="text-xs text-muted-foreground">{err || loading.label}</div>
          <SettingsFields />
          <button disabled={!mapReady} onClick={() => prepare(true)} className="w-full rounded-md border py-2 text-sm">Rebuild map</button>
          <div className="text-xs text-muted-foreground">WASD move · Shift sprint · Space jump · C/Ctrl crouch · F3 debug</div>
        </div>
        <div className="text-[11px] text-muted-foreground">Map data © OpenStreetMap contributors</div>
      </div>
    );

  return (
    <div className="fixed inset-0" onClick={() => { const g = useGame.getState(); if (!g.paused && !input.mobile && !document.pointerLockElement) document.body.requestPointerLock(); }}>
      <Canvas dpr={[1, q.dpr]} shadows={q.shadows} camera={{ fov: 70, near: 0.1, far: 1200 }}>
        <Physics gravity={[0, 0, 0]}>
          <Atmosphere />
          <Ground />
          <TileManager />
          <Player />
        </Physics>
        <DebugProbe />
      </Canvas>
      <Hud />
      {input.mobile && !paused && <MobileControls />}
    </div>
  );
}
