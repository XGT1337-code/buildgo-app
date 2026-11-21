# @workspace/reference

Shared reference data and checks used by the API server and the app.

- `src/data/places.ts` — every city, town, village and hamlet in Azerbaijan with its district and coordinates. Generated from OpenStreetMap (data © OpenStreetMap contributors, ODbL 1.0) by `scripts/build-places.mjs` from the Overpass extracts in `data-src/`.
- `src/data/works.ts`, `materials.ts`, `equipment.ts` — kinds of construction work, building materials, machine and tool types, brands and models (az / ru / en).
- `src/vehicle.ts` — VIN, Azerbaijani plate and driving-licence checks, licence and operator-certificate category ↔ machine rules.
- `src/catalog.ts`, `src/text.ts` — cross-script fuzzy search and the "can this name exist?" check for new catalog items.

`places.ts` is committed ready to use. To refresh it, run the two Overpass queries from the header of `scripts/build-places.mjs`, save the results into `data-src/` (not included in this repository), then `pnpm --filter @workspace/reference run build:places`.
