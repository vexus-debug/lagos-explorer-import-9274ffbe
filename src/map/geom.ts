/** Small 2D geometry helpers shared by main thread and worker. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function signedArea(pts: number[]) {
  let a = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return a / 2;
}

export function centroid(pts: number[]): [number, number] {
  let x = 0,
    z = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    x += pts[i * 2];
    z += pts[i * 2 + 1];
  }
  return [x / n, z / n];
}

export function pointInRing(x: number, z: number, pts: number[]) {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2],
      zi = pts[i * 2 + 1],
      xj = pts[j * 2],
      zj = pts[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from point to segment. */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax,
    dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t - px,
    z = az + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}

/** Sutherland–Hodgman clip of a ring against an axis-aligned rectangle. */
export function clipRing(pts: number[], minX: number, minZ: number, maxX: number, maxZ: number) {
  let poly: [number, number][] = [];
  for (let i = 0; i < pts.length; i += 2) poly.push([pts[i], pts[i + 1]]);
  const edges: [(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]][] = [
    [(p) => p[0] >= minX, (a, b) => [minX, a[1] + ((b[1] - a[1]) * (minX - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= maxX, (a, b) => [maxX, a[1] + ((b[1] - a[1]) * (maxX - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= minZ, (a, b) => [a[0] + ((b[0] - a[0]) * (minZ - a[1])) / (b[1] - a[1]), minZ]],
    [(p) => p[1] <= maxZ, (a, b) => [a[0] + ((b[0] - a[0]) * (maxZ - a[1])) / (b[1] - a[1]), maxZ]],
  ];
  for (const [inside, inter] of edges) {
    const out: [number, number][] = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i],
        prev = poly[(i + poly.length - 1) % poly.length];
      const ci = inside(cur),
        pi = inside(prev);
      if (ci) {
        if (!pi) out.push(inter(prev, cur));
        out.push(cur);
      } else if (pi) out.push(inter(prev, cur));
    }
    poly = out;
    if (!poly.length) break;
  }
  return poly.flat();
}
