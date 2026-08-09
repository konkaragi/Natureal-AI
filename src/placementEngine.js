import { pointInPolygon, polygonArea } from "./cadEngine.js";

const SPECIES_PALETTE = [
  "#7c8f52", "#b5623a", "#c9a227", "#5b7c99", "#8c5a8c",
  "#4f7a4f", "#a65d57", "#6b8caf", "#9b7653", "#5f9ea0",
  "#b06a9e", "#7a9d54", "#c17a3f", "#527a7a", "#a3763f",
  "#6f8f6f", "#9c5f6d", "#5a7d9a", "#8a8f4f", "#7d5a8f"
];

export function placePlantMix(zone, mix) {
  const points = zone?.points || [];
  if (points.length < 3 || !mix) {
    return { sLine: [], placements: [], schedule: [] };
  }

  const rng = mulberry32(hashString(zone.id || zone.name || "zone"));
  const area = polygonArea(points);
  const sLine = buildSLine(points, rng);
  const colorFor = makeColorAssigner();

  const placements = [];
  placeFrameworkAnchors(mix.groups.frameworkAnchor, sLine, points, area, colorFor, rng, placements);
  placeMatrixAnchors(mix.groups.matrixAnchor, points, area, colorFor, rng, placements);
  placeSatellites(mix.groups.satellite, points, area, colorFor, rng, placements);
  placeFillers(mix.groups.filler, points, area, colorFor, rng, placements);

  return { sLine, placements, schedule: buildSchedule(placements) };
}

function buildSLine(points, rng) {
  let start = points[0];
  let end = points[0];
  let maxDist = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = distance(points[i], points[j]);
      if (d > maxDist) {
        maxDist = d;
        start = points[i];
        end = points[j];
      }
    }
  }

  const bounds = getBounds(points);
  const amplitude = Math.min(bounds.width, bounds.height) * 0.12;
  const perpendicular = normalize({ x: -(end.y - start.y), y: end.x - start.x });
  const samples = 24;
  const line = [];

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const base = { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) };
    const offset = Math.sin(t * Math.PI * 2) * amplitude;
    let point = { x: base.x + perpendicular.x * offset, y: base.y + perpendicular.y * offset };
    point = pullInsidePolygon(point, points, centroid(points));
    line.push(point);
  }

  return line;
}

function placeFrameworkAnchors(species = [], sLine, polygon, area, colorFor, rng, out) {
  if (!species.length || !sLine.length) return;
  const perSpecies = Math.max(1, Math.min(3, Math.round(area / 40000)));
  const slots = species.length * perSpecies;
  const step = Math.max(1, Math.floor(sLine.length / (slots + 1)));

  let slotIndex = 0;
  species.forEach((plant) => {
    const color = colorFor(plant.scientificName);
    for (let i = 0; i < perSpecies; i += 1) {
      slotIndex += 1;
      const anchorPoint = sLine[Math.min(sLine.length - 1, slotIndex * step)];
      const jittered = jitter(anchorPoint, 10, rng);
      const point = pullInsidePolygon(jittered, polygon, centroid(polygon));
      out.push({
        id: `${plant.id}-fw-${i}`,
        scientificName: plant.scientificName,
        commonName: plant.commonName,
        role: "frameworkAnchor",
        color,
        x: point.x,
        y: point.y,
        r: 7
      });
    }
  });
}

function placeMatrixAnchors(species = [], polygon, area, colorFor, rng, out) {
  if (!species.length) return;
  const budget = Math.round(clamp(area / 900, 14, 60));
  const perSpecies = Math.max(3, Math.round(budget / species.length));

  species.forEach((plant) => {
    const color = colorFor(plant.scientificName);
    for (let i = 0; i < perSpecies; i += 1) {
      const point = randomPointInPolygon(polygon, rng);
      if (!point) continue;
      out.push({
        id: `${plant.id}-mx-${i}`,
        scientificName: plant.scientificName,
        commonName: plant.commonName,
        role: "matrixAnchor",
        color,
        x: point.x,
        y: point.y,
        r: 3
      });
    }
  });
}

function placeSatellites(species = [], polygon, area, colorFor, rng, out) {
  if (!species.length) return;
  const clusterCount = area > 60000 ? 2 : 1;

  species.forEach((plant) => {
    const color = colorFor(plant.scientificName);
    for (let cluster = 0; cluster < clusterCount; cluster += 1) {
      const center = randomPointInPolygon(polygon, rng);
      if (!center) continue;

      for (let i = 0; i < 3; i += 1) {
        const point = pullInsidePolygon(jitter(center, 22, rng), polygon, centroid(polygon));
        out.push({
          id: `${plant.id}-sat-${cluster}-${i}`,
          scientificName: plant.scientificName,
          commonName: plant.commonName,
          role: "satellite",
          color,
          x: point.x,
          y: point.y,
          r: 5
        });
      }

      const outlier = pullInsidePolygon(jitter(center, 55, rng), polygon, centroid(polygon));
      out.push({
        id: `${plant.id}-sat-${cluster}-outlier`,
        scientificName: plant.scientificName,
        commonName: plant.commonName,
        role: "satellite",
        color,
        x: outlier.x,
        y: outlier.y,
        r: 5
      });
    }
  });
}

function placeFillers(species = [], polygon, area, colorFor, rng, out) {
  if (!species.length) return;
  const perSpecies = Math.max(1, Math.min(4, Math.round(area / 60000)));

  species.forEach((plant) => {
    const color = colorFor(plant.scientificName);
    for (let i = 0; i < perSpecies; i += 1) {
      const point = randomPointInPolygon(polygon, rng);
      if (!point) continue;
      out.push({
        id: `${plant.id}-fl-${i}`,
        scientificName: plant.scientificName,
        commonName: plant.commonName,
        role: "filler",
        color,
        x: point.x,
        y: point.y,
        r: 3.5
      });
    }
  });
}

function buildSchedule(placements) {
  const bySpecies = new Map();
  placements.forEach((placement) => {
    const key = placement.scientificName;
    if (!bySpecies.has(key)) {
      bySpecies.set(key, {
        scientificName: placement.scientificName,
        commonName: placement.commonName,
        role: placement.role,
        color: placement.color,
        quantity: 0
      });
    }
    bySpecies.get(key).quantity += 1;
  });
  return Array.from(bySpecies.values()).sort((a, b) => roleOrder(a.role) - roleOrder(b.role));
}

function roleOrder(role) {
  return ["frameworkAnchor", "matrixAnchor", "satellite", "filler"].indexOf(role);
}

function randomPointInPolygon(polygon, rng, maxAttempts = 30) {
  const bounds = getBounds(polygon);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = {
      x: bounds.minX + rng() * bounds.width,
      y: bounds.minY + rng() * bounds.height
    };
    if (pointInPolygon(candidate, polygon)) {
      return candidate;
    }
  }
  return null;
}

function pullInsidePolygon(point, polygon, target, maxSteps = 12) {
  let current = point;
  let step = 0;
  while (!pointInPolygon(current, polygon) && step < maxSteps) {
    current = { x: lerp(current.x, target.x, 0.25), y: lerp(current.y, target.y, 0.25) };
    step += 1;
  }
  return current;
}

function makeColorAssigner() {
  const assigned = new Map();
  let next = 0;
  return (scientificName) => {
    if (!assigned.has(scientificName)) {
      assigned.set(scientificName, SPECIES_PALETTE[next % SPECIES_PALETTE.length]);
      next += 1;
    }
    return assigned.get(scientificName);
  };
}

function jitter(point, radius, rng) {
  const angle = rng() * Math.PI * 2;
  const distanceFromCenter = rng() * radius;
  return {
    x: point.x + Math.cos(angle) * distanceFromCenter,
    y: point.y + Math.sin(angle) * distanceFromCenter
  };
}

function centroid(points) {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function getBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
