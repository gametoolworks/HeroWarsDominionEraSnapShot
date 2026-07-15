import { downloadJson } from "./lib/roster.js";
import { addSpecialInventoryVisuals, buildInventoryVisuals, buildOverviewIconUrls, buildPortraitUrls, decodeJsonResponse } from "./lib/static-data.js";

const state = {
  snapshot: null,
  view: "overview",
  query: "",
  sort: "power-desc",
  portraits: {},
  inventoryIcons: {},
  overviewIcons: {},
};

const elements = {
  file: document.querySelector("#json-file"),
  download: document.querySelector("#download-json"),
  empty: document.querySelector("#empty-state"),
  view: document.querySelector("#snapshot-view"),
  error: document.querySelector("#error-box"),
  meta: document.querySelector("#snapshot-meta"),
  heroCount: document.querySelector("#hero-count"),
  titanCount: document.querySelector("#titan-count"),
  petCount: document.querySelector("#pet-count"),
  search: document.querySelector("#search"),
  sort: document.querySelector("#sort"),
  visibleCount: document.querySelector("#visible-count"),
  grid: document.querySelector("#entity-grid"),
  entityToolbar: document.querySelector("#entity-toolbar"),
  overview: document.querySelector("#overview-view"),
  inventory: document.querySelector("#inventory-view"),
  teams: document.querySelector("#teams-view"),
  other: document.querySelector("#other-view"),
  completeJson: document.querySelector("#complete-json"),
  template: document.querySelector("#entity-card-template"),
};

const summaryFields = ["level", "power", "star", "color", "xp", "soulStones"];

function validateSnapshot(value) {
  if (!value || typeof value !== "object") throw new Error("The file does not contain a JSON object.");
  for (const collection of ["heroes", "titans", "pets"]) {
    if (!Array.isArray(value[collection])) {
      throw new Error(`The snapshot is missing its ${collection} array.`);
    }
  }
  return value;
}

function formatNumber(value) {
  return typeof value === "number" ? new Intl.NumberFormat().format(value) : String(value ?? "—");
}

function formatDate(value) {
  if (!value) return "Unknown capture time";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function filenameForSnapshot() {
  const date = state.snapshot?.exportedAtUtc?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `hero-wars-roster-${date}.json`;
}

function compareEntities(left, right) {
  switch (state.sort) {
    case "name-asc": return (left.name || "").localeCompare(right.name || "");
    case "id-asc": return Number(left.id) - Number(right.id);
    case "level-desc": return Number(right.level || 0) - Number(left.level || 0) || Number(right.power || 0) - Number(left.power || 0);
    default: return Number(right.power || 0) - Number(left.power || 0) || Number(right.level || 0) - Number(left.level || 0);
  }
}

function createStat(label, value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = formatNumber(value);
  wrapper.append(term, description);
  return wrapper;
}

function friendlyLabel(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function renderDataValue(value, depth = 0) {
  if (value == null) {
    const empty = document.createElement("span");
    empty.className = "data-empty";
    empty.textContent = "None";
    return empty;
  }

  if (Array.isArray(value)) {
    const list = document.createElement("div");
    list.className = "data-array";
    if (!value.length) {
      list.append(renderDataValue(null));
      return list;
    }
    value.forEach((item, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "data-item";
      if (typeof item === "object" && item != null) {
        const label = document.createElement("div");
        label.className = "data-key";
        label.textContent = `Item ${index + 1}`;
        wrapper.append(label);
      }
      wrapper.append(renderDataValue(item, depth + 1));
      list.append(wrapper);
    });
    return list;
  }

  if (typeof value === "object") {
    const object = document.createElement("div");
    object.className = "data-object";
    const entries = Object.entries(value);
    if (!entries.length) {
      object.append(renderDataValue(null));
      return object;
    }
    for (const [key, nested] of entries) {
      const pair = document.createElement("div");
      pair.className = "data-pair";
      const term = document.createElement("span");
      term.className = "data-key";
      term.textContent = friendlyLabel(key);
      const result = document.createElement("div");
      result.className = "data-value";
      result.append(renderDataValue(nested, depth + 1));
      pair.append(term, result);
      object.append(pair);
    }
    return object;
  }

  const scalar = document.createElement("span");
  if (typeof value === "boolean") scalar.className = "data-boolean";
  scalar.textContent = typeof value === "number" ? formatNumber(value) : String(value);
  return scalar;
}

function renderEntityDetails(entity, container) {
  for (const [key, value] of Object.entries(entity)) {
    if (["id", "name", "entityType"].includes(key)) continue;
    const section = document.createElement("section");
    section.className = "data-section";
    const heading = document.createElement("h3");
    heading.textContent = friendlyLabel(key);
    section.append(heading, renderDataValue(value));
    container.append(section);
  }
}

function createCard(entity) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  card.querySelector(".entity-id").textContent = `ID ${entity.id}`;
  card.querySelector(".entity-name").textContent = entity.name || `Unknown ${entity.entityType || "entity"}`;
  card.querySelector(".entity-type").textContent = entity.entityType || state.view.slice(0, -1);
  const portrait = card.querySelector(".entity-portrait");
  const portraitUrl = entity.portraitUrl || state.portraits[`${entity.entityType}:${entity.id}`];
  if (portraitUrl) {
    portrait.src = portraitUrl;
    portrait.alt = `${entity.name || entity.entityType} portrait`;
    portrait.addEventListener("error", () => portrait.removeAttribute("src"), { once: true });
  }

  const stats = card.querySelector(".stat-grid");
  for (const field of summaryFields) {
    if (entity[field] != null) stats.append(createStat(field, entity[field]));
  }
  renderEntityDetails(entity, card.querySelector(".detail-sections"));
  card.querySelector("pre").textContent = JSON.stringify(entity, null, 2);
  return card;
}

function renderCollection() {
  const entities = state.snapshot?.[state.view] || [];
  const query = state.query.trim().toLocaleLowerCase();
  const visible = entities
    .filter((entity) => !query || String(entity.id).includes(query) || (entity.name || "").toLocaleLowerCase().includes(query))
    .sort(compareEntities);

  elements.grid.replaceChildren(...visible.map(createCard));
  elements.visibleCount.textContent = `${visible.length} of ${entities.length}`;
}

function metric(label, value, iconUrl = null) {
  const card = document.createElement("div");
  card.className = `metric-card metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (iconUrl) {
    const icon = document.createElement("img");
    icon.className = "metric-icon";
    icon.src = iconUrl;
    icon.alt = "";
    card.append(icon);
  }
  const name = document.createElement("span");
  const amount = document.createElement("strong");
  name.textContent = label;
  amount.textContent = formatNumber(value);
  card.append(name, amount);
  return card;
}

function renderOverview() {
  const account = state.snapshot.account || {};
  const grid = document.createElement("div");
  grid.className = "overview-grid";
  const metrics = [
    ["Account level", account.level], ["Experience", account.experience],
    ["Gold", account.gold, state.overviewIcons.gold], ["Emeralds", account.emeralds, state.overviewIcons.emeralds],
    ["Stamina", account.resources?.find(({ name }) => name === "stamina")?.amount, state.overviewIcons.stamina],
    ["VIP points", account.vipPoints], ["Max hero power", account.maxHeroPower],
    ["Max titan power", account.maxTitanPower], ["Saved teams", state.snapshot.teams?.length || 0],
  ];
  metrics.forEach(([label, value, icon]) => value != null && grid.append(metric(label, value, icon)));
  elements.overview.replaceChildren(grid);

}

function renderOther() {
  const account = state.snapshot.account || {};
  const heading = document.createElement("h2");
  heading.className = "section-title";
  heading.textContent = "Other resources and counters";
  const resources = document.createElement("div");
  resources.className = "overview-grid";
  (account.resources || [])
    .filter((resource) => resource.amount > 0 && resource.name !== "stamina")
    .forEach((resource) => resources.append(metric(
      resource.name ? friendlyLabel(resource.name) : `Resource ${resource.id}`,
      resource.amount,
    )));
  const chestHeading = document.createElement("h2");
  chestHeading.className = "section-title";
  chestHeading.textContent = "Chest progression";
  const chest = document.createElement("div");
  chest.className = "data-section";
  chest.append(renderDataValue(state.snapshot.chestProgress || {}));
  elements.other.replaceChildren(heading, resources, chestHeading, chest);
}

function renderInventory() {
  const container = document.createElement("div");
  container.className = "inventory-groups";
  for (const [category, items] of Object.entries(state.snapshot.inventory || {})) {
    if (!items.length) continue;
    const section = document.createElement("section");
    section.className = "inventory-category";
    const heading = document.createElement("h2");
    heading.textContent = `${friendlyLabel(category)} (${items.length})`;
    const list = document.createElement("div");
    list.className = "inventory-items";
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "inventory-item";
      const icon = document.createElement("span");
      icon.className = "inventory-icon";
      let visual = state.inventoryIcons[`${category}:${item.id}`];
      if (["fragmentHero", "fragmentTitan", "fragmentPet"].includes(category)) {
        const type = category === "fragmentHero" ? "hero" : category === "fragmentTitan" ? "titan" : "pet";
        visual = state.portraits[`${type}:${item.id}`] || visual;
      }
      if (typeof visual === "string") {
        icon.style.backgroundImage = `url("${visual}")`;
        icon.style.backgroundSize = "contain";
      } else if (visual?.imageUrl) {
        const scale = 32 / Math.max(visual.width, visual.height);
        icon.style.backgroundImage = `url("${visual.imageUrl}")`;
        icon.style.backgroundPosition = `${-visual.x * scale}px ${-visual.y * scale}px`;
        icon.style.backgroundSize = `auto`;
        icon.style.setProperty("--sprite-scale", scale);
        icon.dataset.sprite = "true";
        icon.style.backgroundPosition = `${-visual.x * scale}px ${-visual.y * scale}px`;
        // Scaling the entire atlas requires its dimensions; use a nested
        // original-size sprite instead, transformed inside the clipped icon.
        const sprite = document.createElement("span");
        sprite.className = "inventory-sprite";
        sprite.style.width = `${visual.width}px`;
        sprite.style.height = `${visual.height}px`;
        sprite.style.backgroundImage = `url("${visual.imageUrl}")`;
        sprite.style.backgroundPosition = `${-visual.x}px ${-visual.y}px`;
        sprite.style.transform = `scale(${scale})`;
        icon.style.backgroundImage = "none";
        icon.append(sprite);
      }
      const name = document.createElement("span");
      const amount = document.createElement("strong");
      name.textContent = item.name || `ID ${item.id}`;
      name.title = name.textContent;
      amount.textContent = formatNumber(item.amount);
      row.append(icon, name, amount);
      list.append(row);
    });
    section.append(heading, list);
    container.append(section);
  }
  elements.inventory.replaceChildren(container);
}

function renderTeams() {
  const groups = [
    ["Hero Arenas", (mode) => ["arena", "arena_def", "grand", "grand_def"].includes(mode)],
    ["Titan Arena", (mode) => mode.startsWith("titan_arena")],
    ["Dungeon", (mode) => mode.startsWith("dungeon_")],
    ["Campaign, Tower & Global PvP", (mode) => ["mission", "tower", "clan_global_pvp"].includes(mode)],
    ["Guild Defenses", (mode) => /^(clanDefence_|crossClanDefence_|clan_pvp_)/.test(mode)],
  ];
  const container = document.createElement("div");
  for (const [groupName, includes] of groups) {
    const matching = (state.snapshot.teams || []).filter((team) => includes(team.mode));
    if (!matching.length) continue;
    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = groupName;
    const grid = document.createElement("div");
    grid.className = "team-grid";
    for (const team of matching) {
      const card = document.createElement("article");
      card.className = "team-card";
      const heading = document.createElement("h2");
      heading.textContent = friendlyLabel(team.mode);
      const squads = document.createElement("div");
      squads.className = "team-squads";
      (team.squads || [team.members]).forEach((membersList, squadIndex) => {
        const squad = document.createElement("div");
        squad.className = "team-squad";
        if ((team.squads || []).length > 1) {
          const squadLabel = document.createElement("span");
          squadLabel.className = "squad-label";
          squadLabel.textContent = `Team ${squadIndex + 1}`;
          squad.append(squadLabel);
        }
        const members = document.createElement("div");
        members.className = "team-members";
        membersList.forEach((member) => {
          const pill = document.createElement("button");
          pill.type = "button";
          pill.className = "team-member";
          const type = member.id >= 6000 ? "pet" : member.id >= 4000 ? "titan" : "hero";
          const image = document.createElement("img");
          image.alt = "";
          image.loading = "lazy";
          const portraitUrl = state.portraits[`${type}:${member.id}`];
          if (portraitUrl) image.src = portraitUrl;
          const label = document.createElement("span");
          label.textContent = member.name || `ID ${member.id}`;
          pill.append(image, label);
          pill.addEventListener("click", () => {
            state.view = type === "hero" ? "heroes" : `${type}s`;
            state.query = String(member.id);
            elements.search.value = state.query;
            renderView();
            elements.grid.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          members.append(pill);
        });
        squad.append(members);
        squads.append(squad);
      });
      card.append(heading, squads);
      grid.append(card);
    }
    container.append(title, grid);
  }
  elements.teams.replaceChildren(container);
}

function renderView() {
  const isEntity = ["heroes", "titans", "pets"].includes(state.view);
  elements.overview.hidden = state.view !== "overview";
  elements.inventory.hidden = state.view !== "inventory";
  elements.teams.hidden = state.view !== "teams";
  elements.other.hidden = state.view !== "other";
  elements.grid.hidden = !isEntity;
  elements.entityToolbar.hidden = !isEntity;
  document.querySelectorAll(".view-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === state.view));
  elements.view.querySelector(".summary-grid").hidden = !isEntity;
  document.querySelectorAll(".summary-card").forEach((card) => {
    card.hidden = !isEntity || card.dataset.view !== state.view;
  });

  if (isEntity) renderCollection();
  else if (state.view === "overview") renderOverview();
  else if (state.view === "inventory") renderInventory();
  else if (state.view === "teams") renderTeams();
  else if (state.view === "other") renderOther();
}

async function loadVisualAssets(snapshot) {
  try {
    if (globalThis.chrome?.storage?.local) {
      const stored = await chrome.storage.local.get(["latestPortraitUrls", "latestInventoryIconUrls", "latestOverviewIconUrls"]);
      if (stored.latestPortraitUrls) {
        return { portraits: stored.latestPortraitUrls, inventoryIcons: stored.latestInventoryIconUrls || {}, overviewIcons: stored.latestOverviewIconUrls || {} };
      }
    }

    // Local development path. The extension will fetch the current index URL
    // discovered from Hero Wars rather than relying on this captured version.
    const index = await decodeJsonResponse(await fetch("../index.assets.json.gz"));
    const library = await decodeJsonResponse(await fetch("../lib.json.gz"));
    const base = "https://heroeswb-a-cdn.nextersglobal.com/envs/production/wb/assets/";
    const inventoryIcons = await buildInventoryVisuals(library, index, base, snapshot);
    const layouts = await (await fetch("./assets/sprite-layouts.json")).json();
    addSpecialInventoryVisuals(inventoryIcons, layouts, library, index, base, snapshot);
    return {
      portraits: buildPortraitUrls(index, base, snapshot),
      inventoryIcons,
      overviewIcons: buildOverviewIconUrls(index, base),
    };
  } catch {
    return { portraits: {}, inventoryIcons: {}, overviewIcons: {} };
  }
}

async function showSnapshot(snapshot) {
  state.snapshot = validateSnapshot(snapshot);
  elements.heroCount.textContent = snapshot.heroes.length;
  elements.titanCount.textContent = snapshot.titans.length;
  elements.petCount.textContent = snapshot.pets.length;
  elements.meta.textContent = `Captured ${formatDate(snapshot.exportedAtUtc)} · Schema ${snapshot.schemaVersion ?? "unknown"}`;
  elements.completeJson.textContent = JSON.stringify(snapshot, null, 2);
  elements.download.disabled = false;
  elements.empty.hidden = true;
  elements.view.hidden = false;
  elements.error.hidden = true;
  const visuals = await loadVisualAssets(snapshot);
  state.portraits = visuals.portraits;
  state.inventoryIcons = visuals.inventoryIcons;
  state.overviewIcons = visuals.overviewIcons;
  state.overviewIcons.emeralds = "./assets/emerald.png";
  state.overviewIcons.gold = "./assets/gold.png";
  renderView();
}

function showError(error) {
  elements.error.textContent = error instanceof Error ? error.message : String(error);
  elements.error.hidden = false;
}

elements.file.addEventListener("change", async () => {
  const [file] = elements.file.files;
  if (!file) return;
  try {
    await showSnapshot(JSON.parse(await file.text()));
  } catch (error) {
    showError(error);
  } finally {
    elements.file.value = "";
  }
});

elements.download.addEventListener("click", () => {
  if (state.snapshot) downloadJson(state.snapshot, filenameForSnapshot());
});

elements.search.addEventListener("input", () => {
  state.query = elements.search.value;
  if (["heroes", "titans", "pets"].includes(state.view)) renderCollection();
});

elements.sort.addEventListener("change", () => {
  state.sort = elements.sort.value;
  if (["heroes", "titans", "pets"].includes(state.view)) renderCollection();
});

document.querySelectorAll(".summary-card").forEach((card) => {
  card.addEventListener("click", () => {
    state.view = card.dataset.view;
    renderView();
  });
});

document.querySelectorAll(".view-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.view = tab.dataset.view;
    renderView();
  });
});

async function loadInitialSnapshot() {
  try {
    // The background worker stores only the sanitized snapshot here before it
    // opens viewer.html in a new extension tab.
    if (globalThis.chrome?.storage?.local) {
      const { latestRosterSnapshot } = await chrome.storage.local.get("latestRosterSnapshot");
      if (latestRosterSnapshot) {
        await showSnapshot(latestRosterSnapshot);
        return;
      }
    }

    // Convenient fallback for browser-based development outside an installed
    // extension. Opening a JSON file remains available in every mode.
    const pending = sessionStorage.getItem("heroWarsRosterSnapshot");
    if (pending) await showSnapshot(JSON.parse(pending));
  } catch (error) {
    showError(error);
  }
}

loadInitialSnapshot();
