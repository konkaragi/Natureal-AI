import {
  createSampleCad,
  createZoneFromPolygon,
  detectPlantingZones,
  parseCadText
} from "./cadEngine.js";
import { derivePreferences, generatePlantMix, getRoleLabels, parsePlantsCsv } from "./plantEngine.js";

const state = {
  plants: [],
  cad: createSampleCad(),
  zones: [],
  selectedZoneId: null,
  drawing: false,
  draftPoints: [],
  recommendations: []
};

const dom = {
  plantDataStatus: document.querySelector("#plantDataStatus"),
  cadInput: document.querySelector("#cadInput"),
  cadSvg: document.querySelector("#cadSvg"),
  cadTitle: document.querySelector("#cadTitle"),
  cadMeta: document.querySelector("#cadMeta"),
  interactionHint: document.querySelector("#interactionHint"),
  autoDetectButton: document.querySelector("#autoDetectButton"),
  drawZoneButton: document.querySelector("#drawZoneButton"),
  finishZoneButton: document.querySelector("#finishZoneButton"),
  generateButton: document.querySelector("#generateButton"),
  zoneList: document.querySelector("#zoneList"),
  zoneCount: document.querySelector("#zoneCount"),
  recommendationList: document.querySelector("#recommendationList"),
  promptInput: document.querySelector("#promptInput"),
  locationInput: document.querySelector("#locationInput"),
  climateInput: document.querySelector("#climateInput"),
  soilTypeInput: document.querySelector("#soilTypeInput"),
  soilPhInput: document.querySelector("#soilPhInput"),
  drainageInput: document.querySelector("#drainageInput"),
  styleInput: document.querySelector("#styleInput"),
  waterInput: document.querySelector("#waterInput"),
  pollinatorInput: document.querySelector("#pollinatorInput"),
  colorInput: document.querySelector("#colorInput"),
  seasonInput: document.querySelector("#seasonInput")
};

init();

async function init() {
  await loadPlants();
  autoDetectZones();
  bindEvents();
  render();
}

async function loadPlants() {
  try {
    const response = await fetch("./data/plants.csv");
    const text = await response.text();
    state.plants = parsePlantsCsv(text);
    dom.plantDataStatus.textContent = `${state.plants.length.toLocaleString()} plants loaded`;
  } catch (error) {
    dom.plantDataStatus.textContent = "Plant data unavailable";
    console.error(error);
  }
}

function bindEvents() {
  dom.cadInput.addEventListener("change", handleCadUpload);
  dom.autoDetectButton.addEventListener("click", () => {
    autoDetectZones();
    render();
  });
  dom.drawZoneButton.addEventListener("click", startDrawing);
  dom.finishZoneButton.addEventListener("click", finishDrawing);
  dom.generateButton.addEventListener("click", generateRecommendations);
  dom.cadSvg.addEventListener("click", handleSvgClick);

  [
    dom.climateInput,
    dom.soilTypeInput,
    dom.soilPhInput,
    dom.drainageInput,
    dom.waterInput,
    dom.pollinatorInput,
    dom.colorInput,
    dom.seasonInput,
    dom.promptInput
  ].forEach((input) => input.addEventListener("change", generateRecommendations));
}

async function handleCadUpload(event) {
  const [file] = event.target.files;
  if (!file) return;

  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".dxf") || file.name.toLowerCase().endsWith(".svg")) {
    state.cad = parseCadText(text, file.name);
    dom.cadTitle.textContent = file.name;
    dom.cadMeta.textContent = `${state.cad.entities.length} parsed CAD entities`;
    autoDetectZones();
  } else {
    dom.cadTitle.textContent = file.name;
    dom.cadMeta.textContent = "Preview-only file type; draw zones manually over the plan.";
    state.zones = [];
    state.selectedZoneId = null;
  }
  render();
}

function autoDetectZones() {
  state.zones = detectPlantingZones(state.cad);
  state.selectedZoneId = state.zones[0]?.id || null;
  state.recommendations = [];
  dom.interactionHint.textContent = state.zones.length
    ? "Review detected planting zones, then generate plant mixes."
    : "No planting zones detected. Draw polygons manually.";
}

function startDrawing() {
  state.drawing = true;
  state.draftPoints = [];
  dom.finishZoneButton.disabled = false;
  dom.interactionHint.textContent = "Click points around a planting area, then finish the zone.";
  render();
}

function finishDrawing() {
  if (state.draftPoints.length < 3) {
    dom.interactionHint.textContent = "A planting zone needs at least three points.";
    return;
  }

  const zone = createZoneFromPolygon(state.draftPoints, {
    id: `manual-${state.zones.length + 1}`,
    name: `Manual planting zone ${state.zones.length + 1}`,
    sourceLayer: "manual",
    community: "meadow"
  });
  state.zones = [...state.zones, zone];
  state.selectedZoneId = zone.id;
  state.drawing = false;
  state.draftPoints = [];
  dom.finishZoneButton.disabled = true;
  dom.interactionHint.textContent = "Manual zone added. Tune its attributes before generating.";
  render();
}

function handleSvgClick(event) {
  if (!state.drawing) return;
  const point = getSvgPoint(event);
  state.draftPoints = [...state.draftPoints, point];
  render();
}

function generateRecommendations() {
  if (!state.plants.length || !state.zones.length) {
    return;
  }

  const site = getSiteInputs();
  const preferences = derivePreferences(dom.promptInput.value, {
    colors: dom.colorInput.value,
    seasonality: dom.seasonInput.value,
    pollinatorPriority: dom.pollinatorInput.value
  });

  state.recommendations = state.zones.map((zone) => generatePlantMix(state.plants, zone, site, preferences));
  renderRecommendations();
}

function render() {
  renderCad();
  renderZones();
  renderRecommendations();
}

function renderCad() {
  dom.cadSvg.innerHTML = "";

  state.cad.entities.forEach((entity) => {
    if (entity.type === "polyline") {
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", entity.closed ? "polygon" : "polyline");
      polyline.setAttribute("points", pointsToAttribute(entity.points));
      polyline.setAttribute("class", classForCadEntity(entity));
      dom.cadSvg.append(polyline);
    }

    if (entity.type === "line") {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", entity.x1);
      line.setAttribute("y1", entity.y1);
      line.setAttribute("x2", entity.x2);
      line.setAttribute("y2", entity.y2);
      line.setAttribute("class", "cad-line");
      dom.cadSvg.append(line);
    }

    if (entity.type === "text") {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", entity.x);
      text.setAttribute("y", entity.y);
      text.setAttribute("class", "cad-text");
      text.textContent = entity.text;
      dom.cadSvg.append(text);
    }
  });

  state.zones.forEach((zone) => {
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", pointsToAttribute(zone.points));
    polygon.setAttribute("class", `zone-shape ${zone.id === state.selectedZoneId ? "selected" : ""}`);
    polygon.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedZoneId = zone.id;
      render();
    });
    dom.cadSvg.append(polygon);
  });

  if (state.draftPoints.length) {
    const draft = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    draft.setAttribute("points", pointsToAttribute(state.draftPoints));
    draft.setAttribute("class", "draft-line");
    dom.cadSvg.append(draft);

    state.draftPoints.forEach((point) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", point.x);
      circle.setAttribute("cy", point.y);
      circle.setAttribute("r", 5);
      circle.setAttribute("class", "draft-point");
      dom.cadSvg.append(circle);
    });
  }
}

function renderZones() {
  dom.zoneCount.textContent = `${state.zones.length} zone${state.zones.length === 1 ? "" : "s"}`;

  if (!state.zones.length) {
    dom.zoneList.innerHTML = '<div class="empty-state">Upload CAD with closed planting layers or draw zones manually.</div>';
    return;
  }

  dom.zoneList.innerHTML = "";
  state.zones.forEach((zone) => {
    const card = document.createElement("article");
    card.className = `zone-card ${zone.id === state.selectedZoneId ? "selected" : ""}`;
    card.addEventListener("click", () => {
      state.selectedZoneId = zone.id;
      render();
    });
    card.innerHTML = `
      <div class="zone-card-header">
        <strong>${escapeHtml(zone.name)}</strong>
        <span class="badge">${Math.max(12, zone.areaM2)} m2</span>
      </div>
      <label>
        Zone name
        <input data-field="name" value="${escapeHtml(zone.name)}" />
      </label>
      <div class="zone-grid">
        <label>
          Community
          <select data-field="community">
            ${option("meadow", "Meadow", zone.community)}
            ${option("shrub-steppe", "Shrub-steppe", zone.community)}
            ${option("woodland-edge", "Woodland edge", zone.community)}
            ${option("wetland", "Wetland", zone.community)}
            ${option("low-scrub", "Low scrub", zone.community)}
          </select>
        </label>
        <label>
          Exposure
          <select data-field="exposure">
            ${option("Full Sun", "Full Sun", zone.exposure)}
            ${option("Partial Sun", "Partial Sun", zone.exposure)}
            ${option("Shade", "Shade", zone.exposure)}
          </select>
        </label>
      </div>
      <div class="badge-row">
        <span class="badge">${escapeHtml(zone.sourceLayer)}</span>
        <span class="badge">fuzzy edges allowed</span>
      </div>
    `;

    card.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", (event) => {
        zone[event.target.dataset.field] = event.target.value;
        generateRecommendations();
      });
    });

    dom.zoneList.append(card);
  });
}

function renderRecommendations() {
  if (!state.recommendations.length) {
    dom.recommendationList.className = "recommendation-list empty-state";
    dom.recommendationList.textContent =
      state.zones.length > 0
        ? "Generate a plant design to populate anchors, matrix, satellites, and fillers."
        : "Define planting zones first.";
    return;
  }

  const labels = getRoleLabels();
  dom.recommendationList.className = "recommendation-list";
  dom.recommendationList.innerHTML = "";

  state.recommendations.forEach((mix) => {
    const wrapper = document.createElement("article");
    wrapper.className = "role-group";
    wrapper.innerHTML = `
      <div class="mix-summary">
        <h3>${escapeHtml(mix.zoneName)} · ${mix.totalSpecies} species</h3>
        <p>${escapeHtml(mix.summary)} Density: ${escapeHtml(mix.density)}.</p>
      </div>
    `;

    Object.entries(labels).forEach(([role, label]) => {
      const plants = mix.groups[role] || [];
      if (!plants.length) return;

      const roleTitle = document.createElement("p");
      roleTitle.className = "role-title";
      roleTitle.textContent = label;
      wrapper.append(roleTitle);

      plants.forEach((plant) => wrapper.append(createPlantCard(plant)));
    });

    dom.recommendationList.append(wrapper);
  });
}

function createPlantCard(plant) {
  const card = document.createElement("div");
  card.className = "plant-card";
  card.innerHTML = `
    <div>
      <strong>${escapeHtml(plant.scientificName)}</strong>
      <p>${escapeHtml(plant.commonName || "Common name unavailable")}</p>
    </div>
    <div class="plant-meta">
      <span>score ${plant.score}</span>
      <span>${escapeHtml(plant.heightLabel || `${plant.maxHeight}cm`)}</span>
    </div>
    <div class="badge-row">
      ${plant.reasons.map((reason) => `<span class="badge">${escapeHtml(reason)}</span>`).join("")}
    </div>
  `;
  return card;
}

function getSiteInputs() {
  return {
    location: dom.locationInput.value,
    climateZone: dom.climateInput.value.trim(),
    soilType: dom.soilTypeInput.value,
    soilPh: dom.soilPhInput.value,
    drainage: dom.drainageInput.value,
    style: dom.styleInput.value,
    waterTarget: dom.waterInput.value
  };
}

function getSvgPoint(event) {
  const point = dom.cadSvg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(dom.cadSvg.getScreenCTM().inverse());
  return { x: Math.round(transformed.x), y: Math.round(transformed.y) };
}

function classForCadEntity(entity) {
  const layer = (entity.layer || "").toLowerCase();
  if (layer.includes("contour")) return "cad-contour";
  if (layer.includes("hardscape") || layer.includes("building")) return "cad-hardscape";
  return "cad-line";
}

function pointsToAttribute(points) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function option(value, label, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
