/**
 * Builds merged geometry buffers, collider triangles and prop placements for one
 * tile. Runs inside a Web Worker (see workers/tileBuilder.worker.ts).
 */
import { ShapeUtils, Vector2 } from "three";
import { mulberry32, pointInRing, signedArea } from "../map/geom";
import type { TileFeatures } from "../map/tiles";

export const PROP_TYPES = ["lamp", "tree", "kiosk", "stall", "car", "danfo", "trash", "billboard", "tank"] as const;
export type PropType = (typeof PROP_TYPES)[number];
/** Per-instance floats: x, y, z, rotY, scale, r, g, b */
export const PROP_STRIDE = 8;

export interface TileMesh {
  key: string;
  bld: { position: Float32Array; normal: Float32Array; color: Float32Array; facade: Float32Array };
  ground: { position: Float32Array; normal: Float32Array; color: Float32Array };
  colVerts: Float32Array;
  colIdx: Uint32Array;
  props: Record<PropType, Float32Array>;
  lamps: Float32Array;
}

class Buf {
  p: number[] = [];
  n: number[] = [];
  c: number[] = [];
  f: number[] = [];
  constructor(private facade: boolean) {}
  tri(a: number[], b: number[], c: number[], col: number[], nrm?: number[], fa?: number[], fb?: number[], fc?: number[]) {
    let nx: number, ny: number, nz: number;
    if (nrm) [nx, ny, nz] = nrm;
    else {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    }
    this.p.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) { this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); }
    if (this.facade) this.f.push(...(fa ?? [-1, -1]), ...(fb ?? [-1, -1]), ...(fc ?? [-1, -1]));
  }
  quad(a: number[], b: number[], c: number[], d: number[], col: number[], nrm?: number[], fa?: number[], fb?: number[], fc?: number[], fd?: number[]) {
    this.tri(a, b, c, col, nrm, fa, fb, fc);
    this.tri(a, c, d, col, nrm, fa, fc, fd);
  }
}

class Col {
  v: number[] = [];
  i: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[]) {
    const o = this.v.length / 3;
    this.v.push(...a, ...b, ...c, ...d);
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  box(x: number, z: number, rot: number, len: number, wid: number, h: number, y0 = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const pt = (lx: number, lz: number) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const corners = [pt(-len / 2, -wid / 2), pt(len / 2, -wid / 2), pt(len / 2, wid / 2), pt(-len / 2, wid / 2)];
    for (let k = 0; k < 4; k++) {
      const a = corners[k], b = corners[(k + 1) % 4];
      this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y0 + h, b[1]], [a[0], y0 + h, a[1]]);
    }
    this.quad([corners[0][0], y0 + h, corners[0][1]], [corners[1][0], y0 + h, corners[1][1]], [corners[2][0], y0 + h, corners[2][1]], [corners[3][0], y0 + h, corners[3][1]]);
  }
}

const hex = (h: number) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const shade = (c: number[], k: number) => [c[0] * k, c[1] * k, c[2] * k];
const AWNINGS = [0xb3402f, 0x2f5fa3, 0x3f8a4a, 0xd9a521, 0x8a3f7a, 0xc9682b].map(hex);
const CAR_COLORS = [0xd8d8d8, 0x2a2a2a, 0x8c1c1c, 0x1f3b6b, 0x9a9a9a, 0x5a6b3a, 0xe0d4b0].map(hex);
const MAJOR = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "motorway_link", "trunk_link", "primary_link", "secondary_link"]);

export function buildTile(t: TileFeatures): TileMesh {
  const rnd = mulberry32((t.i * 73856093) ^ (t.j * 19349663));
  const bld = new Buf(true);
  const gnd = new Buf(false);
  const col = new Col();
  const props: Record<PropType, number[]> = Object.fromEntries(PROP_TYPES.map((p) => [p, []])) as unknown as Record<PropType, number[]>;
  const addProp = (type: PropType, x: number, y: number, z: number, rot: number, scale = 1, color = [1, 1, 1]) =>
    props[type].push(x, y, z, rot, scale, color[0], color[1], color[2]);
  const UP = [0, 1, 0];

  // ---------- Buildings ----------
  for (const b of t.buildings) {
    let ring = b.pts;
    if (signedArea(ring) < 0) {
      const r: number[] = [];
      for (let i = ring.length - 2; i >= 0; i -= 2) r.push(ring[i], ring[i + 1]);
      ring = r;
    }
    const n = ring.length / 2;
    const r2 = mulberry32(b.id);
    const color = hex(b.color);
    // Slanted roofs tilt along a random axis.
    const ang = r2() * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
    let minP = Infinity;
    for (let i = 0; i < n; i++) minP = Math.min(minP, ring[i * 2] * dx + ring[i * 2 + 1] * dz);
    const top = (i: number) => (b.roof === "slant" ? b.h + 0.35 * (ring[i * 2] * dx + ring[i * 2 + 1] * dz - minP) : b.h);
    let perim = 0;
    let longest = -1, longestLen = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      // CCW in (x,z) with +z "down" => outward normal is (-dz, dx)
      const nrm = [-(bz - az) / L, 0, (bx - ax) / L];
      const ta = top(i), tb = top(j);
      bld.quad([ax, 0, az], [bx, 0, bz], [bx, tb, bz], [ax, ta, az], color, nrm, [perim, 0], [perim + L, 0], [perim + L, tb], [perim, ta]);
      col.quad([ax, 0, az], [bx, 0, bz], [bx, tb, bz], [ax, ta, az]);
      perim += L;
      if (L > longestLen) { longestLen = L; longest = i; }
    }
    // Roof
    const contour: Vector2[] = [];
    for (let i = 0; i < n; i++) contour.push(new Vector2(ring[i * 2], ring[i * 2 + 1]));
    const roofCol = b.roof === "slant" ? shade(hex(0x8a4b35), 0.9 + r2() * 0.2) : shade(color, 0.78);
    try {
      for (const [a, c, d] of ShapeUtils.triangulateShape(contour, [])) {
        bld.tri([ring[a * 2], top(a), ring[a * 2 + 1]], [ring[c * 2], top(c), ring[c * 2 + 1]], [ring[d * 2], top(d), ring[d * 2 + 1]], roofCol, b.roof === "flat" ? UP : undefined);
      }
    } catch { /* degenerate footprint */ }
    // Awning over the ground floor on the longest facade
    if (longest >= 0 && longestLen > 4) {
      const j = (longest + 1) % n;
      const ax = ring[longest * 2], az = ring[longest * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
      const L = longestLen, nx = -(bz - az) / L, nz = (bx - ax) / L;
      const t0 = 0.15, t1 = 0.85, depth = 1.4;
      const p0 = [ax + (bx - ax) * t0 + nx * 0.05, az + (bz - az) * t0 + nz * 0.05];
      const p1 = [ax + (bx - ax) * t1 + nx * 0.05, az + (bz - az) * t1 + nz * 0.05];
      const ac = AWNINGS[Math.floor(r2() * AWNINGS.length)];
      bld.quad([p0[0], 2.9, p0[1]], [p1[0], 2.9, p1[1]], [p1[0] + nx * depth, 2.5, p1[1] + nz * depth], [p0[0] + nx * depth, 2.5, p0[1] + nz * depth], ac);
    }
    // Water tanks on flat roofs
    if (b.roof === "flat" && b.h > 6 && r2() < 0.65) {
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += ring[i * 2]; cz += ring[i * 2 + 1]; }
      cx /= n; cz /= n;
      if (pointInRing(cx, cz, ring)) addProp("tank", cx, b.h, cz, r2() * 6, 0.8 + r2() * 0.5, r2() < 0.6 ? [0.12, 0.12, 0.13] : [0.2, 0.35, 0.7]);
    }
  }

  // ---------- Parks & ponds ----------
  const area = (pts: number[], y: number, c: number[]) => {
    const contour: Vector2[] = [];
    for (let i = 0; i < pts.length; i += 2) contour.push(new Vector2(pts[i], pts[i + 1]));
    try {
      for (const [a, b, d] of ShapeUtils.triangulateShape(contour, []))
        gnd.tri([pts[a * 2], y, pts[a * 2 + 1]], [pts[b * 2], y, pts[b * 2 + 1]], [pts[d * 2], y, pts[d * 2 + 1]], c, UP);
    } catch { /* ignore */ }
  };
  for (const p of t.parks) {
    area(p.pts, 0.012, hex(0x5f8a45));
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.pts.length; i += 2) {
      minX = Math.min(minX, p.pts[i]); maxX = Math.max(maxX, p.pts[i]);
      minZ = Math.min(minZ, p.pts[i + 1]); maxZ = Math.max(maxZ, p.pts[i + 1]);
    }
    const count = Math.min(50, ((maxX - minX) * (maxZ - minZ)) / 180);
    for (let k = 0; k < count; k++) {
      const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ);
      if (pointInRing(x, z, p.pts)) addProp("tree", x, 0, z, rnd() * 6, 0.8 + rnd() * 0.7, [0.85 + rnd() * 0.3, 1, 0.85]);
    }
  }
  for (const w of t.water) area(w.pts, 0.015, hex(0x2d6f8a));

  // ---------- Roads ----------
  const sorted = [...t.roads].sort((a, b) => a.width - b.width);
  sorted.forEach((r, rank) => {
    const n = r.pts.length / 2;
    if (n < 2) return;
    const baseY = 0.02 + Math.min(rank, 40) * 0.0008 + (r.foot ? 0 : 0.002);
    const ey = (i: number) => (r.elev ? r.elev[i] : 0);
    const hw = r.width / 2;
    const asphalt = r.foot ? hex(r.kind === "steps" ? 0x9a9184 : 0xa39a88) : MAJOR.has(r.kind) ? hex(0x3b3d40) : hex(0x4a4a48);
    // Offsets per vertex (mitered)
    const off: number[][] = [];
    for (let i = 0; i < n; i++) {
      const pi = Math.max(0, i - 1), ni = Math.min(n - 1, i + 1);
      let tx = r.pts[ni * 2] - r.pts[pi * 2], tz = r.pts[ni * 2 + 1] - r.pts[pi * 2 + 1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      let m = 1;
      if (i > 0 && i < n - 1) {
        const sx = r.pts[i * 2] - r.pts[pi * 2], sz = r.pts[i * 2 + 1] - r.pts[pi * 2 + 1];
        const sl = Math.hypot(sx, sz) || 1;
        const cos = (sx / sl) * tx + (sz / sl) * tz;
        m = 1 / Math.max(0.5, cos);
      }
      off.push([-tz * m, tx * m]);
    }
    const sidewalk = !r.foot && !r.bridge && MAJOR.has(r.kind);
    for (let i = 0; i < n - 1; i++) {
      const ax = r.pts[i * 2], az = r.pts[i * 2 + 1], bx = r.pts[i * 2 + 2], bz = r.pts[i * 2 + 3];
      const oa = off[i], ob = off[i + 1];
      const ya = baseY + ey(i), yb = baseY + ey(i + 1);
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      const nx = -dz, nz = dx;
      const la = [ax + oa[0] * hw, ya, az + oa[1] * hw], ra = [ax - oa[0] * hw, ya, az - oa[1] * hw];
      const lb = [bx + ob[0] * hw, yb, bz + ob[1] * hw], rb = [bx - ob[0] * hw, yb, bz - ob[1] * hw];
      gnd.quad(ra, rb, lb, la, asphalt, r.elev ? undefined : UP);

      // Lane markings: dashed centre line
      if (!r.foot && r.width >= 6) {
        const yellow = r.width >= 10;
        for (let s = 1; s + 3 < L; s += 7) {
          const t0 = s / L, t1 = (s + 3) / L;
          const p0 = [ax + (bx - ax) * t0, ya + (yb - ya) * t0 + 0.01, az + (bz - az) * t0];
          const p1 = [ax + (bx - ax) * t1, ya + (yb - ya) * t1 + 0.01, az + (bz - az) * t1];
          const w = 0.12;
          gnd.quad([p0[0] - nx * w, p0[1], p0[2] - nz * w], [p1[0] - nx * w, p1[1], p1[2] - nz * w], [p1[0] + nx * w, p1[1], p1[2] + nz * w], [p0[0] + nx * w, p0[1], p0[2] + nz * w], yellow ? hex(0xd9b23a) : hex(0xdedbd2), UP);
        }
      }
      // Raised sidewalks along main roads
      if (sidewalk) {
        const sw = 2.4, h = 0.18;
        for (const side of [1, -1]) {
          const ia = [ax + side * oa[0] * hw, az + side * oa[1] * hw], ib = [bx + side * ob[0] * hw, bz + side * ob[1] * hw];
          const oa2 = [ax + side * oa[0] * (hw + sw), az + side * oa[1] * (hw + sw)], ob2 = [bx + side * ob[0] * (hw + sw), bz + side * ob[1] * (hw + sw)];
          const topA = [ia[0], h, ia[1]], topB = [ib[0], h, ib[1]], topC = [ob2[0], h, ob2[1]], topD = [oa2[0], h, oa2[1]];
          gnd.quad(topA, topB, topC, topD, hex(0x9c978c), UP);
          gnd.quad([ia[0], 0, ia[1]], [ib[0], 0, ib[1]], topB, topA, hex(0xc8c3b6), [-side * nx, 0, -side * nz]);
          col.quad(topA, topB, topC, topD);
          col.quad([ia[0], 0, ia[1]], [ib[0], 0, ib[1]], topB, topA);
        }
      }
      // Bridges: walkable deck + rails + fascia
      if (r.bridge) {
        col.quad(ra, rb, lb, la);
        for (const [p, q, side] of [[la, lb, 1], [ra, rb, -1]] as [number[], number[], number][]) {
          const railCol = hex(0xb9b4a8);
          gnd.quad(p, q, [q[0], q[1] + 1.0, q[2]], [p[0], p[1] + 1.0, p[2]], railCol, [side * nx, 0, side * nz]);
          gnd.quad([p[0], p[1] - 1.2, p[2]], [q[0], q[1] - 1.2, q[2]], q, p, shade(railCol, 0.7), [side * nx, 0, side * nz]);
          col.quad(p, q, [q[0], q[1] + 1.1, q[2]], [p[0], p[1] + 1.1, p[2]]);
        }
        gnd.quad([ra[0], ra[1] - 1.2, ra[2]], [rb[0], rb[1] - 1.2, rb[2]], [lb[0], lb[1] - 1.2, lb[2]], [la[0], la[1] - 1.2, la[2]], hex(0x6f6b64), [0, -1, 0]);
        continue;
      }

      // ---------- Props along the segment ----------
      const rot = Math.atan2(-dz, dx);
      const curbY = sidewalk ? 0.18 : 0;
      const edge = hw + (sidewalk ? 1.2 : 0.8);
      if (!r.foot) {
        const lampStep = sidewalk ? 28 : 42;
        for (let s = rnd() * lampStep; s < L; s += lampStep) {
          const side = Math.floor(s / lampStep) % 2 === 0 ? 1 : -1;
          const x = ax + dx * s + nx * edge * side, z = az + dz * s + nz * edge * side;
          addProp("lamp", x, curbY, z, rot + (side > 0 ? Math.PI : 0));
        }
        const parked = r.kind === "residential" || r.kind === "service" || r.kind === "tertiary" || r.kind === "secondary" || r.kind === "unclassified";
        if (parked || r.kind === "primary") {
          for (let s = 3; s < L - 3; s += 7 + rnd() * 4) {
            const p = rnd();
            const side = rnd() < 0.5 ? 1 : -1;
            const o = hw - 1.15;
            const x = ax + dx * s + nx * o * side, z = az + dz * s + nz * o * side;
            if (p < 0.1 || (r.kind === "primary" && p < 0.16)) {
              addProp("danfo", x, 0, z, rot, 1);
              col.box(x, z, rot, 5, 2, 2.3);
              s += 3;
            } else if (p < (r.kind === "primary" ? 0.2 : 0.42)) {
              addProp("car", x, 0, z, rot, 1, CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]);
              col.box(x, z, rot, 4.2, 1.8, 1.5);
            }
          }
        }
        if (r.kind === "primary" || r.kind === "trunk" || r.kind === "secondary") {
          if (L > 30 && rnd() < 0.35) {
            const side = rnd() < 0.5 ? 1 : -1, s = L / 2;
            addProp("billboard", ax + dx * s + nx * (edge + 3) * side, 0, az + dz * s + nz * (edge + 3) * side, rot, 1, AWNINGS[Math.floor(rnd() * AWNINGS.length)]);
          }
        }
      }
      // Street life: kiosks, market stalls, trash, trees
      const lively = r.foot || r.kind === "residential" || r.kind === "tertiary" || r.kind === "unclassified" || r.kind === "pedestrian" || r.kind === "living_street";
      for (let s = rnd() * 6; s < L; s += 6) {
        const side = rnd() < 0.5 ? 1 : -1;
        const o = edge + 1.6;
        const x = ax + dx * s + nx * o * side, z = az + dz * s + nz * o * side;
        const p = rnd();
        if (lively && p < 0.07) {
          addProp("kiosk", x, curbY, z, rot + (side > 0 ? Math.PI : 0), 1, AWNINGS[Math.floor(rnd() * AWNINGS.length)]);
          col.box(x, z, rot, 2.2, 1.6, 2.4, curbY);
        } else if (lively && p < 0.14) {
          addProp("stall", x, curbY, z, rot + (side > 0 ? Math.PI : 0), 1, AWNINGS[Math.floor(rnd() * AWNINGS.length)]);
        } else if (p < 0.165) {
          addProp("trash", x, curbY, z, rnd() * 6, 0.7 + rnd() * 0.6);
        } else if (p < (r.foot ? 0.2 : 0.2)) {
          addProp("tree", x, curbY, z, rnd() * 6, 0.7 + rnd() * 0.5, [0.85 + rnd() * 0.3, 1, 0.85]);
        }
      }
    }
  });

  // Lamp positions (for night point lights)
  const lp = props.lamp;
  const lamps: number[] = [];
  for (let k = 0; k < lp.length; k += PROP_STRIDE) lamps.push(lp[k], lp[k + 1] + 6, lp[k + 2]);

  return {
    key: t.key,
    bld: { position: new Float32Array(bld.p), normal: new Float32Array(bld.n), color: new Float32Array(bld.c), facade: new Float32Array(bld.f) },
    ground: { position: new Float32Array(gnd.p), normal: new Float32Array(gnd.n), color: new Float32Array(gnd.c) },
    colVerts: new Float32Array(col.v),
    colIdx: new Uint32Array(col.i),
    props: Object.fromEntries(PROP_TYPES.map((p) => [p, new Float32Array(props[p])])) as Record<PropType, Float32Array>,
    lamps: new Float32Array(lamps),
  };
}
