# Natureal AI

Natureal AI is a browser prototype for turning CAD landscape plans into editable
naturalistic planting zones, spatially placed plant designs, and plant schedules.

## What it does

- Uploads DXF/SVG CAD exports and parses closed planting polylines, layers, and text annotations.
- Auto-detects planting zones from CAD layer names and annotations.
- Lets users draw manual planting zones over the plan.
- Allows zone-level editing for plant community type, sun exposure, drainage, and water target.
- Generates naturalistic plant mixes from `data/plants.csv` using site, soil, climate, water, color,
  seasonality, and pollinator preferences.
- Groups recommendations into framework anchors, matrix anchors, satellites, and fillers with a max
  of 20 species per zone, following the naturalistic planting design methodology (S-line, centers of
  gravity, anchors/satellites/fillers).
- Spatially places every plant instance inside its zone polygon (not just a flat list): framework
  anchors along a computed S-line, matrix anchors as a dense base layer, satellites as a clump-of-three-
  plus-an-outlier per species, and fillers scattered in gaps — rendered as colored dots on the CAD plan.
- Produces a per-zone plant schedule (species, role, color, quantity) alongside the spatial plan.

See `docs/market-validation-2026.md` for sourced 2026 competitive research validating this product
direction and identifying the specific gap this prototype targets (CAD-native ingestion + automated
naturalistic multi-layer plant-community generation).

## Setup

Requires Node.js (any recent LTS version) and no other dependencies — this is a dependency-free
static app.

```bash
git clone https://github.com/konkaragi/Natureal-AI.git
cd Natureal-AI
git checkout cursor/natureal-prototype-b162   # or check out the PR branch you're reviewing
```

## Run locally

```bash
npm start
```

Open `http://localhost:4173` in a browser.

## Automated tests

```bash
npm test
```

This runs `tests/recommendation.test.mjs`, which verifies: the full plant CSV parses correctly
(4,462 species), CAD zone detection works on both the built-in sample CAD and a DXF fixture, the
recommendation engine respects the naturalistic rules (max 20 species per mix, includes matrix and
satellite layers), and the spatial placement engine produces valid results (every placed plant falls
inside its zone polygon, all four structural roles are represented, and schedule quantities match
the number of placed instances).

## Manual walkthrough — things to try in the browser

1. **Explore the sample CAD.** On load, the app shows a sample CAD plan with 3 auto-detected zones
   (`meadow mix`, `dry shrub-steppe`, `woodland edge`), each pre-filled with a community type,
   exposure, drainage, and water target.
2. **Edit a zone.** Click a zone card on the right and change its Community (e.g. to `Wetland`) —
   watch the Drainage/Water fields update automatically to match that community's defaults.
3. **Draw a manual zone.** Click `Draw zone`, click 3+ points on the CAD plan to outline a new
   planting area, then click `Finish zone`. The new zone appears at the top of the zone list, ready
   to configure.
4. **Upload a real CAD file.** Click `Upload CAD / SVG` and choose a `.dxf` or `.svg` export from
   your own CAD tool. The app parses layers/polylines/text and re-runs zone auto-detection against it.
5. **Set site parameters.** Adjust Location, Soil, and Parameters (planting approach, water target,
   pollinator priority, preferred colors, seasonality) in the left sidebar, and edit the free-text
   prompt above the CAD plan.
6. **Generate the design.** Click `Generate plant design`. You should see:
   - Colored dots placed across every zone on the CAD plan, sized by structural role (larger =
     framework anchor, small = matrix anchor/filler, medium = satellite).
   - A faint dashed S-line running through each zone (the "line of flow" anchors are placed along).
   - A plant schedule table per zone (color swatch, species, role, quantity) in the right panel.
   - Detailed plant cards below the schedule, grouped by role, each showing why that species was
     recommended (climate/soil/water match, pollinator value, palette match, etc.).
7. **Regenerate.** Change any input (site parameters, a zone's community, the prompt) and click
   `Generate plant design` again to see the plan update.
