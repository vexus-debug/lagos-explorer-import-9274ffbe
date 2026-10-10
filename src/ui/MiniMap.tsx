/** Corner minimap (north-up, follows player). Tap/click to open a full map. */
import { useEffect, useRef } from "react";
import { bboxMeters } from "../map/config";
import { useGame } from "../store/game";
import { worldState } from "../world/worldState";

const SCALE = 0.25; // px per metre in the base image
let base: HTMLCanvasElement | null = null;
let baseFor: unknown = null;

function getBase() {
  if (base && baseFor === worldState.data) return base;
  baseFor = worldState.data;
  const bb = bboxMeters();
  const pad = 200;
  const c = document.createElement("canvas");
  c.width = Math.ceil((bb.maxX - bb.minX + pad * 2) * SCALE);
  c.height = Math.ceil((bb.maxZ - bb.minZ + pad * 2) * SCALE);
  const g = c.getContext("2d")!;
  const ox = bb.minX - pad, oz = bb.minZ - pad;
  g.fillStyle = "#24566a";
  g.fillRect(0, 0, c.width, c.height);
  const m = worldState.land;
  if (m) {
    g.fillStyle = "#8d8474";
    const k = m.cell * SCALE;
    for (let r = 0; r < m.h; r++) {
      let col = 0;
      while (col < m.w) {
        if (m.data[r * m.w + col] !== 1) { col++; continue; }
        const s = col;
        while (col < m.w && m.data[r * m.w + col] === 1) col++;
        g.fillRect((m.minX + s * m.cell - ox) * SCALE, (m.minZ + r * m.cell - oz) * SCALE, (col - s) * k + 0.5, k + 0.5);
      }
    }
  }
  g.lineCap = "round";
  for (const rd of worldState.data?.roads ?? []) {
    if (rd.foot) continue;
    g.strokeStyle = rd.width >= 10 ? "#f2d27a" : "#e8e4da";
    g.lineWidth = Math.max(1, rd.width * SCALE);
    g.beginPath();
    for (let i = 0; i < rd.pts.length; i += 2) {
      const x = (rd.pts[i] - ox) * SCALE, y = (rd.pts[i + 1] - oz) * SCALE;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  (c as HTMLCanvasElement & { ox: number; oz: number }).ox = ox;
  (c as HTMLCanvasElement & { ox: number; oz: number }).oz = oz;
  base = c;
  return c;
}

type View = { zoom: number; cx: number; cy: number; init: boolean };
function useDraw(ref: React.RefObject<HTMLCanvasElement | null>, full: boolean, view?: React.RefObject<View>) {
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      if (!cv || !worldState.data) return;
      const b = getBase() as HTMLCanvasElement & { ox: number; oz: number };
      const W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
      const tw = Math.round(W * dpr), th = Math.round(H * dpr);
      if (!W || !H) return;
      if (cv.width !== tw || cv.height !== th) { cv.width = tw; cv.height = th; }
      const g = cv.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#24566a";
      g.fillRect(0, 0, W, H);
      const p = worldState.playerPos;
      const px = (p.x - b.ox) * SCALE, pz = (p.z - b.oz) * SCALE;
      let zoom: number, cx: number, cy: number;
      if (full && view?.current) {
        const v = view.current;
        if (!v.init) { v.init = true; v.zoom = 1; v.cx = px; v.cy = pz; }
        zoom = v.zoom; cx = v.cx; cy = v.cy;
      } else {
        zoom = 1.6; cx = px; cy = pz;
      }
      g.save();
      g.translate(W / 2, H / 2);
      g.scale(zoom, zoom);
      g.translate(-cx, -cy);
      g.drawImage(b, 0, 0);
      g.restore();
      // Player arrow
      const sx = W / 2 + (px - cx) * zoom, sy = H / 2 + (pz - cy) * zoom;
      const yaw = worldState.playerYaw;
      g.save();
      g.translate(sx, sy);
      g.rotate(-yaw);
      g.fillStyle = "#ff4d3a";
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      const s = full ? 9 : 7;
      g.beginPath();
      g.moveTo(0, -s * 1.4); g.lineTo(s, s); g.lineTo(0, s * 0.4); g.lineTo(-s, s); g.closePath();
      g.fill(); g.stroke();
      g.restore();
      g.fillStyle = "#fff";
      g.font = "bold 12px sans-serif";
      g.fillText("N", W / 2 - 4, 14);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [ref, full, view]);
}

export function MiniMap() {
  const { ui, toggleUi, set } = useGame();
  const small = useRef<HTMLCanvasElement>(null);
  const big = useRef<HTMLCanvasElement>(null);
  useDraw(small, false);
  const view = useRef<View>({ zoom: 1, cx: 0, cy: 0, init: false });
  useDraw(big, true, view);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const zoomAt = (k: number, sx: number, sy: number) => {
    const cv = big.current, v = view.current; if (!cv) return;
    const nz = Math.min(8, Math.max(0.05, v.zoom * k)); k = nz / v.zoom;
    const dx = sx - cv.clientWidth / 2, dy = sy - cv.clientHeight / 2;
    v.cx += (dx / v.zoom) * (1 - 1 / k); v.cy += (dy / v.zoom) * (1 - 1 / k); v.zoom = nz;
  };
  useEffect(() => {
    const el = big.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ui.fullMap]);
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const m = pts.current, prev = m.get(e.pointerId); if (!prev) return;
    const v = view.current, r = e.currentTarget.getBoundingClientRect();
    if (m.size === 1) {
      v.cx -= (e.clientX - prev.x) / v.zoom; v.cy -= (e.clientY - prev.y) / v.zoom;
      m.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (m.size >= 2) {
      const other = [...m.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const mx0 = (prev.x + other.x) / 2, my0 = (prev.y + other.y) / 2;
      const mx1 = (e.clientX + other.x) / 2, my1 = (e.clientY + other.y) / 2;
      v.cx -= (mx1 - mx0) / v.zoom; v.cy -= (my1 - my0) / v.zoom;
      m.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (d0 > 0) zoomAt(d1 / d0, mx1 - r.left, my1 - r.top);
    }
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => { pts.current.delete(e.pointerId); };
  const recenter = () => { const v = view.current; const b = getBase() as HTMLCanvasElement & { ox: number; oz: number }; v.cx = (worldState.playerPos.x - b.ox) * SCALE; v.cy = (worldState.playerPos.z - b.oz) * SCALE; };
  if (!ui.minimap) return null;
  return (
    <>
      <button
        aria-label="Open map"
        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); view.current.init = false; set({ ui: { ...useGame.getState().ui, fullMap: true } }); if (document.pointerLockElement) document.exitPointerLock(); }}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto fixed right-3 top-3 z-40 touch-none h-32 w-32 overflow-hidden rounded-full border-2 border-foreground/70 shadow-lg md:h-40 md:w-40"
      >
        <canvas ref={small} className="h-full w-full" />
      </button>
      {ui.fullMap && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden overscroll-none bg-background/90 p-3 backdrop-blur" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-display text-xl text-primary">Lagos Island</div>
            <button className="rounded-md bg-primary px-4 py-1.5 font-semibold text-primary-foreground" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); set({ ui: { ...useGame.getState().ui, fullMap: false } }); }}>Close</button>
          </div>
          <div className="relative min-h-0 flex-1">
            <canvas ref={big} className="absolute inset-0 h-full w-full touch-none rounded-md" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
            <div className="absolute bottom-3 right-3 flex flex-col gap-2">
              {[["+", () => zoomAt(1.5, big.current!.clientWidth / 2, big.current!.clientHeight / 2)], ["−", () => zoomAt(1 / 1.5, big.current!.clientWidth / 2, big.current!.clientHeight / 2)], ["◎", recenter]].map(([l, fn]) => (
                <button key={l as string} className="h-11 w-11 rounded-full bg-card text-xl font-bold text-foreground shadow" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); (fn as () => void)(); }}>{l as string}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
