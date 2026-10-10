/// <reference lib="webworker" />
// Builds tile meshes off the main thread so walking never stutters.
import { buildTile } from "../world/buildTile";
import type { TileFeatures } from "../map/tiles";

self.onmessage = (e: MessageEvent<TileFeatures>) => {
  const m = buildTile(e.data);
  const transfer: Transferable[] = [
    m.bld.position.buffer, m.bld.normal.buffer, m.bld.color.buffer, m.bld.facade.buffer,
    m.ground.position.buffer, m.ground.normal.buffer, m.ground.color.buffer,
    m.colVerts.buffer, m.colIdx.buffer, m.lamps.buffer,
    ...Object.values(m.props).map((p) => p.buffer),
  ];
  (self as unknown as Worker).postMessage(m, transfer);
};
