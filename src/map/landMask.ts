/** Rasterised land/water mask (even-odd scanline fill) for fast "is this water?" checks. */
import type { Area, Road } from "./types";

export class LandMask {
  readonly cell = 4;
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
  constructor(readonly minX: number, readonly minZ: number, maxX: number, maxZ: number, land: Area[], roads?: Road[]) {
    this.w = Math.ceil((maxX - minX) / this.cell);
    this.h = Math.ceil((maxZ - minZ) / this.cell);
    this.data = new Uint8Array(this.w * this.h);
    const rings: number[][] = [];
    for (const a of land) {
      rings.push(a.pts);
      for (const h of a.holes ?? []) rings.push(h);
    }
    // Each polygon is filled separately (even-odd within its own rings) then OR-ed.
    for (const a of land) {
      const rs = [a.pts, ...(a.holes ?? [])];
      for (let row = 0; row < this.h; row++) {
        const z = minZ + (row + 0.5) * this.cell;
        const xs: number[] = [];
        for (const r of rs) {
          const n = r.length / 2;
          for (let i = 0, j = n - 1; i < n; j = i++) {
            const zi = r[i * 2 + 1], zj = r[j * 2 + 1];
            if (zi > z !== zj > z) xs.push(r[i * 2] + ((r[j * 2] - r[i * 2]) * (z - zi)) / (zj - zi));
          }
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const c0 = Math.max(0, Math.floor((xs[k] - minX) / this.cell));
          const c1 = Math.min(this.w - 1, Math.floor((xs[k + 1] - minX) / this.cell));
          this.data.fill(1, row * this.w + c0, row * this.w + c1 + 1);
        }
      }
    }
    if (roads?.length) this.addRoadFallback(roads);
  }

  /** OSM land polygons are often incomplete; if most roads sit "in water", buffer road corridors as land. */
  private addRoadFallback(roads: Road[], radius = 40) {
    let total = 0, onLand = 0;
    for (const r of roads) {
      if (r.bridge) continue;
      for (let i = 0; i + 1 < r.pts.length; i += 2) {
        total++;
        if (this.isLand(r.pts[i], r.pts[i + 1])) onLand++;
      }
    }
    if (total === 0 || onLand / total > 0.8) return;
    const rc = Math.ceil(radius / this.cell);
    const r2 = rc * rc;
    const stamp = (x: number, z: number) => {
      const cx = Math.floor((x - this.minX) / this.cell), cz = Math.floor((z - this.minZ) / this.cell);
      for (let dz = -rc; dz <= rc; dz++) {
        const row = cz + dz;
        if (row < 0 || row >= this.h) continue;
        const span = Math.floor(Math.sqrt(r2 - dz * dz));
        const c0 = Math.max(0, cx - span), c1 = Math.min(this.w - 1, cx + span);
        if (c0 <= c1) this.data.fill(1, row * this.w + c0, row * this.w + c1 + 1);
      }
    };
    const step = this.cell * 2;
    for (const r of roads) {
      if (r.bridge) continue;
      for (let i = 0; i + 3 < r.pts.length; i += 2) {
        const x1 = r.pts[i], z1 = r.pts[i + 1], dx = r.pts[i + 2] - x1, dz = r.pts[i + 3] - z1;
        const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / step));
        for (let k = 0; k <= n; k++) stamp(x1 + (dx * k) / n, z1 + (dz * k) / n);
      }
    }
  }
  isLand(x: number, z: number) {
    const c = Math.floor((x - this.minX) / this.cell);
    const r = Math.floor((z - this.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.w || r >= this.h) return false;
    return this.data[r * this.w + c] === 1;
  }
}
