# Natureal AI

Natureal AI is a browser prototype for turning CAD landscape plans into editable
naturalistic planting zones and plant mixes.

## What it does

- Uploads DXF/SVG CAD exports and parses closed planting polylines, layers, and text annotations.
- Auto-detects planting zones from CAD layer names and annotations.
- Lets users draw manual planting zones over the plan.
- Allows zone-level editing for plant community type and sun exposure.
- Generates naturalistic plant mixes from `data/plants.csv` using site, soil, climate, water, color, seasonality, and pollinator preferences.
- Groups recommendations into framework anchors, matrix anchors, satellites, and fillers with a max of 20 species per zone.

## Run locally

```bash
npm start
```

Open `http://localhost:4173`.

## Test

```bash
npm test
```
