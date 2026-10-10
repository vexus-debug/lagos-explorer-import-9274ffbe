# ÈKÓ — Lagos Island open-world prototype
Change the area in `src/map/config.ts` (`BBOX`), then click **Rebuild map** on the landing screen
(or bump `CACHE_VERSION`). Pre-bake `public/lagos-island.json` with `bun scripts/build-map.ts`.
Folders: map/ (Overpass, cache, tiles), workers/ (tile mesh builder), world/, player/, audio/, ui/, store/, vehicles/ (stub).
