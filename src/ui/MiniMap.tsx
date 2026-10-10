/** Corner minimap (north-up, follows player). Tap/click to open a full map. */
import { useEffect, useRef } from "react";
import { bboxMeters } from "../map/config";
import { useGame } from "../store/game";
import { worldState } from "../world/worldState";

const SCALE = 0.25; // px per metre in the base image
let base: HTMLCanvasElement | null = null;

function getBase() {
  if (base) return base;
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

function useDraw(ref: React.RefObject<HTMLCanvasElement | null>, full: boolean) {
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      if (!cv || !worldState.data) return;
      const b = getBase() as HTMLCanvasElement & { ox: number; oz: number };
      const W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
      if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      const g = cv.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#24566a";
      g.fillRect(0, 0, W, H);
      const p = worldState.playerPos;
      const px = (p.x - b.ox) * SCALE, pz = (p.z - b.oz) * SCALE;
      let zoom: number, cx: number, cy: number;
      if (full) {
        zoom = Math.min(W / b.width, H / b.height);
        cx = b.width / 2; cy = b.height / 2;
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
  }, [ref, full]);
}

export function MiniMap() {
  const { ui, toggleUi, set } = useGame();
  const small = useRef<HTMLCanvasElement>(null);
  const big = useRef<HTMLCanvasElement>(null);
  useDraw(small, false);
  useDraw(big, true);
  if (!ui.minimap) return null;
  return (
    <>
      <button
        aria-label="Open map"
        onClick={(e) => { e.stopPropagation(); if (document.pointerLockElement) document.exitPointerLock(); toggleUi("fullMap"); }}
        className="pointer-events-auto fixed right-3 top-3 z-20 h-32 w-32 overflow-hidden rounded-full border-2 border-foreground/70 shadow-lg md:h-40 md:w-40"
      >
        <canvas ref={small} className="h-full w-full" />
      </button>
      {ui.fullMap && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex flex-col bg-background/90 p-3 backdrop-blur" onClick={(e) => e.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-display text-xl text-primary">Lagos Island</div>
            <button className="rounded-md bg-primary px-4 py-1.5 font-semibold text-primary-foreground" onClick={() => set({ ui: { ...useGame.getState().ui, fullMap: false } })}>Close</button>
          </div>
          <canvas ref={big} className="w-full flex-1 rounded-md" />
        </div>
      )}
    </>
  );
}
