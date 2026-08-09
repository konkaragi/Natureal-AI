const VIEWBOX = { width: 1000, height: 650, padding: 54 };

const ZONE_KEYWORDS = [
  "plant",
  "planting",
  "softscape",
  "bed",
  "garden",
  "meadow",
  "shrub",
  "prairie",
  "rain",
  "bio",
  "green"
];

export function createSampleCad() {
  const contours = Array.from({ length: 12 }, (_, index) => {
    const y = 130 + index * 36;
    return {
      type: "polyline",
      layer: "contours",
      closed: false,
      points: [
        { x: 70, y: y + 14 * Math.sin(index) },
        { x: 210, y: y - 26 },
        { x: 390, y: y + 8 },
        { x: 575, y: y - 18 },
        { x: 850, y: y + 4 }
      ]
    };
  });

  return normalizeCad({
    title: "Sample CAD plan",
    entities: [
      ...contours,
      {
        type: "polyline",
        layer: "hardscape-building",
        closed: true,
        points: [
          { x: 420, y: 170 },
          { x: 650, y: 170 },
          { x: 650, y: 285 },
          { x: 420, y: 285 }
        ]
      },
      {
        type: "polyline",
        layer: "path",
        closed: false,
        points: [
          { x: 330, y: 620 },
          { x: 420, y: 470 },
          { x: 525, y: 360 },
          { x: 650, y: 295 },
          { x: 860, y: 240 }
        ]
      },
      {
        type: "polyline",
        layer: "planting-meadow",
        closed: true,
        points: [
          { x: 95, y: 360 },
          { x: 310, y: 320 },
          { x: 392, y: 456 },
          { x: 250, y: 565 },
          { x: 75, y: 520 }
        ]
      },
      {
        type: "polyline",
        layer: "planting-shrub-steppe",
        closed: true,
        points: [
          { x: 656, y: 308 },
          { x: 850, y: 260 },
          { x: 905, y: 440 },
          { x: 760, y: 515 },
          { x: 635, y: 442 }
        ]
      },
      {
        type: "polyline",
        layer: "planting-woodland-edge",
        closed: true,
        points: [
          { x: 260, y: 90 },
          { x: 406, y: 115 },
          { x: 390, y: 315 },
          { x: 275, y: 300 },
          { x: 208, y: 188 }
        ]
      },
      { type: "text", layer: "annotation", x: 148, y: 395, text: "meadow mix" },
      { type: "text", layer: "annotation", x: 695, y: 350, text: "dry shrub-steppe" },
      { type: "text", layer: "annotation", x: 276, y: 145, text: "woodland edge" }
    ]
  });
}

export function parseCadText(text, fileName = "CAD file") {
  if (/^\s*<svg[\s>]/i.test(text)) {
    return parseSvg(text, fileName);
  }
  return parseDxf(text, fileName);
}

export function parseDxf(text, fileName = "DXF file") {
  const pairs = toDxfPairs(text);
  const entities = [];

  for (let i = 0; i < pairs.length; i += 1) {
    const [code, value] = pairs[i];
    if (code !== "0") {
      continue;
    }

    if (value === "LWPOLYLINE" || value === "POLYLINE") {
      const entity = { type: "polyline", layer: "0", closed: false, points: [] };
      i += 1;
      for (; i < pairs.length && pairs[i][0] !== "0"; i += 1) {
        const [group, groupValue] = pairs[i];
        if (group === "8") {
          entity.layer = groupValue;
        }
        if (group === "70") {
          entity.closed = (Number(groupValue) & 1) === 1;
        }
        if (group === "10") {
          const yPair = pairs[i + 1];
          if (yPair?.[0] === "20") {
            entity.points.push({ x: Number(groupValue), y: Number(yPair[1]) });
          }
        }
      }
      i -= 1;
      if (entity.points.length > 1) {
        entities.push(entity);
      }
    }

    if (value === "LINE") {
      const entity = { type: "line", layer: "0", x1: 0, y1: 0, x2: 0, y2: 0 };
      i += 1;
      for (; i < pairs.length && pairs[i][0] !== "0"; i += 1) {
        const [group, groupValue] = pairs[i];
        if (group === "8") entity.layer = groupValue;
        if (group === "10") entity.x1 = Number(groupValue);
        if (group === "20") entity.y1 = Number(groupValue);
        if (group === "11") entity.x2 = Number(groupValue);
        if (group === "21") entity.y2 = Number(groupValue);
      }
      i -= 1;
      entities.push(entity);
    }

    if (value === "TEXT" || value === "MTEXT") {
      const entity = { type: "text", layer: "annotation", x: 0, y: 0, text: "" };
      i += 1;
      for (; i < pairs.length && pairs[i][0] !== "0"; i += 1) {
        const [group, groupValue] = pairs[i];
        if (group === "8") entity.layer = groupValue;
        if (group === "10") entity.x = Number(groupValue);
        if (group === "20") entity.y = Number(groupValue);
        if (group === "1" || group === "3") entity.text += groupValue;
      }
      i -= 1;
      if (entity.text.trim()) {
        entities.push(entity);
      }
    }
  }

  return normalizeCad({ title: fileName, entities });
}

export function parseSvg(text, fileName = "SVG file") {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const entities = [];
  doc.querySelectorAll("polygon, polyline").forEach((node) => {
    const points = (node.getAttribute("points") || "")
      .trim()
      .split(/\s+/)
      .map((pair) => {
        const [x, y] = pair.split(",").map(Number);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
      })
      .filter(Boolean);

    if (points.length > 1) {
      entities.push({
        type: "polyline",
        layer: node.id || node.getAttribute("class") || "svg",
        closed: node.tagName.toLowerCase() === "polygon",
        points
      });
    }
  });

  doc.querySelectorAll("rect").forEach((node) => {
    const x = Number(node.getAttribute("x") || 0);
    const y = Number(node.getAttribute("y") || 0);
    const width = Number(node.getAttribute("width") || 0);
    const height = Number(node.getAttribute("height") || 0);
    if (width > 0 && height > 0) {
      entities.push({
        type: "polyline",
        layer: node.id || node.getAttribute("class") || "svg",
        closed: true,
        points: [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height }
        ]
      });
    }
  });

  doc.querySelectorAll("text").forEach((node) => {
    entities.push({
      type: "text",
      layer: node.id || node.getAttribute("class") || "annotation",
      x: Number(node.getAttribute("x") || 0),
      y: Number(node.getAttribute("y") || 0),
      text: node.textContent || ""
    });
  });

  return normalizeCad({ title: fileName, entities });
}

export function normalizeCad(cad) {
  const bounds = getBounds(cad.entities);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    (VIEWBOX.width - VIEWBOX.padding * 2) / width,
    (VIEWBOX.height - VIEWBOX.padding * 2) / height
  );
  const offsetX = (VIEWBOX.width - width * scale) / 2;
  const offsetY = (VIEWBOX.height - height * scale) / 2;

  const mapPoint = (point) => ({
    x: offsetX + (point.x - bounds.minX) * scale,
    y: VIEWBOX.height - (offsetY + (point.y - bounds.minY) * scale)
  });

  return {
    title: cad.title,
    bounds,
    entities: cad.entities.map((entity) => {
      if (entity.type === "polyline") {
        return { ...entity, points: entity.points.map(mapPoint) };
      }
      if (entity.type === "line") {
        const start = mapPoint({ x: entity.x1, y: entity.y1 });
        const end = mapPoint({ x: entity.x2, y: entity.y2 });
        return { ...entity, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
      }
      if (entity.type === "text") {
        return { ...entity, ...mapPoint({ x: entity.x, y: entity.y }) };
      }
      return entity;
    })
  };
}

export function detectPlantingZones(cad) {
  const annotations = cad.entities.filter((entity) => entity.type === "text");
  return cad.entities
    .filter((entity) => entity.type === "polyline" && entity.closed && polygonArea(entity.points) > 1600)
    .filter((entity) => looksLikePlantingEntity(entity, annotations))
    .map((entity, index) => {
      const annotation = annotations.find((text) => pointInPolygon(text, entity.points));
      return createZoneFromPolygon(entity.points, {
        id: `zone-${index + 1}`,
        name: annotation?.text || titleFromLayer(entity.layer, index),
        sourceLayer: entity.layer,
        community: inferCommunity(`${entity.layer} ${annotation?.text || ""}`),
        exposure: inferExposure(`${entity.layer} ${annotation?.text || ""}`)
      });
    });
}

export function createZoneFromPolygon(points, overrides = {}) {
  const community = overrides.community || "meadow";
  return {
    id: overrides.id || `zone-${Date.now()}`,
    name: overrides.name || "New planting zone",
    points,
    community,
    exposure: overrides.exposure || "Full Sun",
    drainage: overrides.drainage || defaultDrainageForCommunity(community),
    waterTarget: overrides.waterTarget || defaultWaterForCommunity(community),
    areaM2: Math.round(polygonArea(points) / 520),
    sourceLayer: overrides.sourceLayer || "manual"
  };
}

export function polygonArea(points) {
  if (points.length < 3) {
    return 0;
  }
  return Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function toDxfPairs(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    pairs.push([lines[i].trim(), lines[i + 1].trim()]);
  }
  return pairs;
}

function getBounds(entities) {
  const points = entities.flatMap((entity) => {
    if (entity.type === "polyline") return entity.points;
    if (entity.type === "line")
      return [
        { x: entity.x1, y: entity.y1 },
        { x: entity.x2, y: entity.y2 }
      ];
    if (entity.type === "text") return [{ x: entity.x, y: entity.y }];
    return [];
  });

  if (!points.length) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 650 };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

function looksLikePlantingEntity(entity, annotations) {
  const text = `${entity.layer} ${annotations
    .filter((annotation) => pointInPolygon(annotation, entity.points))
    .map((annotation) => annotation.text)
    .join(" ")}`.toLowerCase();
  return ZONE_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function titleFromLayer(layer, index) {
  return (
    layer
      ?.replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim() || `Planting zone ${index + 1}`
  );
}

function inferCommunity(text) {
  const value = text.toLowerCase();
  if (value.includes("wood")) return "woodland-edge";
  if (value.includes("shrub") || value.includes("steppe")) return "shrub-steppe";
  if (value.includes("rain") || value.includes("wet")) return "wetland";
  if (value.includes("scrub")) return "low-scrub";
  return "meadow";
}

function inferExposure(text) {
  const value = text.toLowerCase();
  if (value.includes("shade") || value.includes("wood")) return "Partial Sun";
  return "Full Sun";
}

function defaultDrainageForCommunity(community) {
  if (community === "wetland") return "Moist but Well-Drained";
  return "Well-Drained";
}

function defaultWaterForCommunity(community) {
  if (community === "wetland" || community === "woodland-edge") return "Average";
  return "Low";
}
