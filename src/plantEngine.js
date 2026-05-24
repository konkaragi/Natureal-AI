const ROLE_LABELS = {
  frameworkAnchor: "Framework anchors",
  matrixAnchor: "Matrix anchors",
  satellite: "Satellites",
  filler: "Free floaters / fillers"
};

const MIX_LIMIT = 20;

export function parseCsv(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) {
      rows.push(row);
    }
  }

  return rows;
}

export function parsePlantsCsv(text) {
  const rows = parseCsv(text);
  const headers = rows[0].map(cleanHeader);

  return rows.slice(1).map((row, index) => {
    const raw = Object.fromEntries(headers.map((header, i) => [header, clean(row[i] || "")]));
    return normalizePlant(raw, index);
  });
}

export function getRoleLabels() {
  return ROLE_LABELS;
}

export function derivePreferences(prompt = "", fields = {}) {
  const text = `${prompt} ${fields.colors || ""} ${fields.seasonality || ""}`.toLowerCase();
  const colors = [
    "white",
    "pink",
    "purple",
    "blue",
    "yellow",
    "orange",
    "red",
    "green",
    "brown",
    "black"
  ].filter((color) => text.includes(color));

  const seasons = ["spring", "summer", "fall", "autumn", "winter"].filter((season) =>
    text.includes(season)
  );

  const requestedTypes = ["tree", "shrub", "grass", "perennial", "bulb", "meadow"].filter((type) =>
    text.includes(type)
  );

  return {
    colors,
    seasons: seasons.map((season) => (season === "autumn" ? "fall" : season)),
    requestedTypes,
    pollinatorPriority: fields.pollinatorPriority || "high"
  };
}

export function generatePlantMix(plants, zone, site, preferences = {}) {
  const scored = plants
    .map((plant) => ({ plant, score: scorePlant(plant, zone, site, preferences) }))
    .filter(({ score }) => score.total >= 5)
    .sort((a, b) => b.score.total - a.score.total);

  const groups = {
    frameworkAnchor: pickRole(scored, "frameworkAnchor", 3),
    matrixAnchor: pickRole(scored, "matrixAnchor", 4),
    satellite: pickRole(scored, "satellite", 9),
    filler: pickRole(scored, "filler", 4)
  };

  const flat = Object.values(groups).flat();
  const unique = dedupeByScientificName(flat).slice(0, MIX_LIMIT);
  const balancedGroups = groupByRole(unique);
  const area = Number(zone.areaM2) || estimateArea(zone.points);

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    totalSpecies: unique.length,
    estimatedAreaM2: Math.max(12, Math.round(area)),
    density: estimateDensity(site.waterTarget),
    groups: balancedGroups,
    summary: summarizeMix(zone, site, preferences, unique)
  };
}

export function scorePlant(plant, zone, site, preferences = {}) {
  const reasons = [];
  let total = 0;

  if (matches(plant.climateZones, site.climateZone)) {
    total += 4;
    reasons.push(`climate zone ${site.climateZone}`);
  } else if (!plant.climateZones.length) {
    total += 1;
    reasons.push("climate data unavailable");
  } else {
    total -= 4;
  }

  if (matches(plant.exposure, zone.exposure)) {
    total += 3;
    reasons.push(zone.exposure);
  }

  if (matches(plant.soilTypes, site.soilType)) {
    total += 2;
    reasons.push(site.soilType);
  }

  if (matches(plant.soilPh, site.soilPh)) {
    total += 1;
  }

  if (matches(plant.drainage, site.drainage)) {
    total += 2;
    reasons.push(site.drainage);
  }

  if (matches(plant.waterNeeds, site.waterTarget) || plant.waterNeeds.includes("low")) {
    total += 3;
    reasons.push(`${plant.waterNeeds.join("/")} water`);
  }

  if (plant.maintenance.includes("low")) {
    total += 2;
    reasons.push("low maintenance");
  }

  if (preferences.pollinatorPriority !== "low" && hasPollinatorValue(plant)) {
    total += preferences.pollinatorPriority === "high" ? 3 : 1;
    reasons.push(`supports ${plant.attracts.slice(0, 2).join(", ")}`);
  }

  if (preferences.colors?.some((color) => plant.flowerColors.includes(color))) {
    total += 2;
    reasons.push("palette match");
  }

  if (preferences.seasons?.some((season) => plant.seasons.includes(season))) {
    total += 1;
    reasons.push("seasonal interest");
  }

  if (preferences.requestedTypes?.some((type) => plant.types.some((plantType) => plantType.includes(type)))) {
    total += 1;
  }

  if (zone.community === "meadow" && (plant.types.includes("grasses") || plant.gardenStyles.includes("prairie and meadow"))) {
    total += 2;
  }

  if (zone.community === "shrub-steppe" && plant.types.includes("shrubs")) {
    total += 2;
  }

  if (plant.tolerance.includes("drought") && /low/i.test(site.waterTarget || "")) {
    total += 2;
    reasons.push("drought tolerant");
  }

  const role = classifyPlantRole(plant, zone);
  return { total, role, reasons: reasons.slice(0, 5) };
}

export function classifyPlantRole(plant, zone = {}) {
  const maxHeight = Number(plant.maxHeight) || 0;
  const lowLayer = maxHeight > 0 && maxHeight <= 90;
  const woody = plant.types.some((type) => ["trees", "shrubs", "conifers"].includes(type));
  const grassLike = plant.types.some((type) => ["grasses", "ornamental grasses", "sedges"].includes(type));
  const groundCover = plant.gardenUses.includes("ground covers") || plant.types.includes("ground covers");
  const shortLived = plant.types.some((type) => ["annuals", "biennials", "bulbs"].includes(type));

  if (shortLived) {
    return "filler";
  }

  if (grassLike || groundCover || (zone.community === "meadow" && lowLayer)) {
    return "matrixAnchor";
  }

  if (woody || maxHeight >= 150) {
    return "frameworkAnchor";
  }

  return "satellite";
}

function normalizePlant(raw, index) {
  return {
    id: `${raw["Scientific Name"] || "plant"}-${index}`,
    scientificName: raw["Scientific Name"],
    commonName: raw["Common Name"],
    climateZones: split(raw["Climate Zones"]),
    types: split(raw["Plant Type"]),
    family: raw["Plant Family"],
    genus: raw.Genus,
    exposure: split(raw.Exposure),
    seasons: splitSeason(raw["Season of Interest"]),
    flowerColors: split(raw["Flower Color"]),
    heightLabel: raw.Height,
    minHeight: Number(raw["Min. Height"]) || 0,
    maxHeight: Number(raw["Max. Height"]) || 0,
    minSpread: Number(raw["Min. Spread"]) || 0,
    maxSpread: Number(raw["Max. Spread"]) || 0,
    maintenance: split(raw.Maintenance),
    waterNeeds: split(raw["Water Needs"]),
    soilTypes: split(raw["Soil Type"]),
    soilPh: split(raw["Soil pH"]),
    drainage: split(raw["Soil Drainage"]),
    characteristics: split(raw.Characteristics),
    tolerance: split(raw.Tolerance),
    attracts: split(raw.Attracts),
    gardenUses: split(raw["Garden Uses"]),
    gardenStyles: split(raw["Garden Styles"])
  };
}

function pickRole(scored, role, limit) {
  return scored
    .filter(({ score }) => score.role === role)
    .slice(0, limit)
    .map(({ plant, score }) => ({
      ...plant,
      score: score.total,
      role,
      reasons: score.reasons
    }));
}

function groupByRole(plants) {
  return Object.keys(ROLE_LABELS).reduce((groups, role) => {
    groups[role] = plants.filter((plant) => plant.role === role);
    return groups;
  }, {});
}

function dedupeByScientificName(plants) {
  const seen = new Set();
  return plants.filter((plant) => {
    const key = plant.scientificName.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function summarizeMix(zone, site, preferences, plants) {
  const roles = Object.entries(groupByRole(plants))
    .filter(([, values]) => values.length)
    .map(([role, values]) => `${values.length} ${ROLE_LABELS[role].toLowerCase()}`);
  const palette = preferences.colors?.length ? preferences.colors.join(", ") : "site-led";
  return `${zone.community} mix for ${zone.exposure}, ${site.soilType}, ${site.drainage}; ${roles.join(", ")}; ${palette} palette.`;
}

function estimateDensity(waterTarget = "") {
  if (/low/i.test(waterTarget)) {
    return "6-8 plants/m2 with a dense living matrix after establishment";
  }
  return "7-9 plants/m2 with tighter early cover";
}

function estimateArea(points = []) {
  if (points.length < 3) {
    return 40;
  }
  const area = Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
  return Math.max(12, area / 520);
}

function matches(values = [], query = "") {
  const normalized = clean(query).toLowerCase();
  if (!normalized) {
    return false;
  }
  return values.some((value) => {
    const item = value.toLowerCase();
    return item === normalized || item.includes(normalized) || normalized.includes(item);
  });
}

function hasPollinatorValue(plant) {
  return plant.attracts.some((item) =>
    ["bees", "butterflies", "birds", "hummingbirds", "pollinators"].includes(item)
  );
}

function split(value = "") {
  return clean(value)
    .replace(/\u00a0/g, " ")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function splitSeason(value = "") {
  const text = clean(value).toLowerCase();
  return ["spring", "summer", "fall", "winter"].filter((season) => text.includes(season));
}

function cleanHeader(value = "") {
  return clean(value).replace(/,+$/g, "");
}

function clean(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}
