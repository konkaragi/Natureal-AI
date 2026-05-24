import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSampleCad, detectPlantingZones, parseDxf } from "../src/cadEngine.js";
import { derivePreferences, generatePlantMix, parsePlantsCsv } from "../src/plantEngine.js";

const csv = await readFile(new URL("../data/plants.csv", import.meta.url), "utf8");
const plants = parsePlantsCsv(csv);

assert.equal(plants.length, 4462, "all supplied plant rows should parse");
assert.ok(plants.some((plant) => plant.attracts.includes("bees")), "pollinator data should be available");
assert.ok(plants.some((plant) => plant.waterNeeds.includes("average")), "water need data should be available");

const sampleCad = createSampleCad();
const detectedZones = detectPlantingZones(sampleCad);

assert.equal(detectedZones.length, 3, "sample CAD should expose three editable planting zones");
assert.ok(detectedZones.some((zone) => zone.community === "shrub-steppe"), "annotations should infer shrub-steppe");

const preferences = derivePreferences("Mediterranean low-water garden with purple flowers, grasses and pollinators", {
  colors: "purple, white",
  seasonality: "Spring, Summer, Fall",
  pollinatorPriority: "high"
});

const mix = generatePlantMix(
  plants,
  { ...detectedZones[0], exposure: "Full Sun", community: "meadow" },
  {
    climateZone: "9",
    soilType: "Loam",
    soilPh: "Neutral",
    drainage: "Well-Drained",
    waterTarget: "Low"
  },
  preferences
);

assert.ok(mix.totalSpecies > 0, "recommendation engine should return plants");
assert.ok(mix.totalSpecies <= 20, "mix should follow the PDF max species rule");
assert.ok(mix.groups.matrixAnchor.length > 0, "naturalistic mixes should include a matrix layer");
assert.ok(mix.groups.satellite.length > 0, "naturalistic mixes should include satellites");
assert.match(mix.summary, /meadow mix/, "mix should explain the selected community");

const dxf = `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
planting-bed
70
1
10
0
20
0
10
20
20
0
10
20
20
15
10
0
20
15
0
TEXT
8
annotation
10
5
20
5
1
rain garden
0
ENDSEC
0
EOF`;

const parsed = parseDxf(dxf, "fixture.dxf");
const zones = detectPlantingZones(parsed);

assert.equal(zones.length, 1, "DXF closed planting polylines should become zones");
assert.equal(zones[0].community, "wetland", "CAD annotation should influence zone community");

console.log("recommendation and CAD parser tests passed");
