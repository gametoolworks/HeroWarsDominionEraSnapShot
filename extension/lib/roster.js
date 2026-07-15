/**
 * Pure data-transformation functions shared by the Chrome extension UI,
 * page-response listener, and tests. This module performs no network access
 * and never reads request headers, cookies, or authentication values.
 */

const CALL_TO_COLLECTION = Object.freeze({
  heroGetAll: "heroes",
  titanGetAll: "titans",
  pet_getAll: "pets",
});

const CALL_TO_DATA = Object.freeze({
  ...CALL_TO_COLLECTION,
  userGetInfo: "accountRaw",
  inventoryGet: "inventoryRaw",
  teamGetAll: "teamsRaw",
  artifactGetChestLevel: "artifactChest",
  titanArtifactGetChest: "titanArtifactChest",
  pet_getChest: "petChest",
});

const ENTITY_TYPES = Object.freeze({
  heroes: "hero",
  titans: "titan",
  pets: "pet",
});

/** Extract the three roster results from one of the game's batched API calls. */
export function extractRosterResponses(requestBody, responseBody) {
  const calls = Array.isArray(requestBody?.calls) ? requestBody.calls : [];
  const results = Array.isArray(responseBody?.results) ? responseBody.results : [];
  const found = {};

  calls.forEach((call, index) => {
    const collection = CALL_TO_DATA[call?.ident];
    if (!collection || index >= results.length) return;

    const response = results[index]?.result?.response;
    if (response != null) found[collection] = response;
  });

  return found;
}

/**
 * Build canonical ID/name maps from the official English localization JSON.
 * The game uses LIB_HERO_NAME_<ID> for heroes, titans, and pets.
 */
export function buildNameMaps(locale) {
  const maps = { heroes: {}, titans: {}, pets: {}, items: {}, resources: {} };

  for (const [key, value] of Object.entries(locale ?? {})) {
    if (typeof value !== "string" || !value) continue;
    const match = /^LIB_HERO_NAME_(\d+)$/.exec(key);
    if (!match) {
      const itemMatch = /^LIB_(CONSUMABLE|GEAR|COIN|SCROLL|ASCENSION_GEAR|PET_GEAR|ARTIFACT|TITAN_ARTIFACT)_NAME_(\d+)$/.exec(key);
      if (itemMatch) maps.items[`${itemMatch[1]}:${itemMatch[2]}`] = value;
      continue;
    }

    const id = Number(match[1]);
    const collection = id >= 6000 ? "pets" : id >= 4000 ? "titans" : "heroes";
    maps[collection][String(id)] = value;
  }

  return maps;
}

/** Add stable identifiers found in the official game-definition library. */
export function addDefinitionNames(nameMaps, library) {
  const maps = nameMaps ?? { heroes: {}, titans: {}, pets: {}, items: {}, resources: {} };
  maps.resources ??= {};
  for (const [id, definition] of Object.entries(library?.refillable ?? {})) {
    if (definition?.ident) maps.resources[id] = definition.ident;
  }
  return maps;
}

const INVENTORY_PREFIX = Object.freeze({
  consumable: "CONSUMABLE",
  gear: "GEAR",
  fragmentGear: "GEAR",
  scroll: "SCROLL",
  fragmentScroll: "SCROLL",
  coin: "COIN",
  ascensionGear: "ASCENSION_GEAR",
  petGear: "PET_GEAR",
  fragmentArtifact: "ARTIFACT",
  fragmentTitanArtifact: "TITAN_ARTIFACT",
});

function entityName(id, nameMaps) {
  const key = String(id);
  return nameMaps?.heroes?.[key] ?? nameMaps?.titans?.[key] ?? nameMaps?.pets?.[key] ?? null;
}

function normalizeInventory(raw, nameMaps) {
  const result = {};
  for (const [category, values] of Object.entries(raw ?? {})) {
    if (!values || typeof values !== "object") continue;
    result[category] = Object.entries(values)
      .map(([id, amount]) => {
        let name = null;
        if (["fragmentHero", "fragmentTitan", "fragmentPet"].includes(category)) {
          name = entityName(id, nameMaps);
        } else {
          const prefix = INVENTORY_PREFIX[category];
          name = prefix ? nameMaps?.items?.[`${prefix}:${id}`] ?? null : null;
        }
        return { id: Number(id), name, amount: Number(amount) };
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || "") || a.id - b.id);
  }
  return result;
}

function sanitizeAccount(raw, nameMaps) {
  if (!raw || typeof raw !== "object") return null;
  return {
    level: raw.level ?? null,
    experience: raw.experience ?? null,
    maxLevel: raw.maxLevel ?? null,
    gold: raw.gold ?? null,
    emeralds: raw.starMoney ?? null,
    vipPoints: raw.vipPoints ?? null,
    maxHeroPower: raw.maxSumPower?.heroes ?? null,
    maxTitanPower: raw.maxSumPower?.titans ?? null,
    resources: (Array.isArray(raw.refillable) ? raw.refillable : []).map(({ id, amount, boughtToday }) => ({
      id: Number(id),
      name: nameMaps?.resources?.[String(id)] ?? null,
      amount: Number(amount),
      boughtToday: Number(boughtToday || 0),
    })),
  };
}

const USEFUL_TEAM = /^(mission|arena|arena_def|tower|grand|grand_def|clanDefence_|crossClanDefence_|clan_pvp_|clan_global_pvp|titan_arena|titan_arena_def|dungeon_(earth|water|fire|neutral|hero))$/;

function normalizeTeams(raw, nameMaps) {
  return Object.entries(raw ?? {})
    .filter(([mode, members]) => USEFUL_TEAM.test(mode) && Array.isArray(members) && members.length)
    .map(([mode, members]) => {
      const squads = Array.isArray(members[0]) ? members : [members];
      return {
        mode,
        squads: squads.map((squad) => squad.map((id) => ({ id: Number(id), name: entityName(id, nameMaps) }))),
      };
    })
    .sort((a, b) => a.mode.localeCompare(b.mode));
}

function valuesFromResponse(response) {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object") return Object.values(response);
  return [];
}

function normalizeCollection(collection, response, nameMap = {}) {
  const entityType = ENTITY_TYPES[collection];

  return valuesFromResponse(response)
    .filter((entity) => entity && Number.isFinite(Number(entity.id)))
    .map((entity) => {
      const id = Number(entity.id);
      const { id: ignoredId, name: embeddedName, ...progression } = entity;

      return {
        id,
        name: embeddedName || nameMap[String(id)] || null,
        entityType,
        ...progression,
      };
    })
    .sort((left, right) => left.id - right.id);
}

/** Create the sanitized JSON-ready object downloaded by the extension. */
export function buildRosterSnapshot(responses, nameMaps, exportedAt = new Date()) {
  const heroes = normalizeCollection("heroes", responses?.heroes, nameMaps?.heroes);
  const titans = normalizeCollection("titans", responses?.titans, nameMaps?.titans);
  const pets = normalizeCollection("pets", responses?.pets, nameMaps?.pets);
  const inventory = normalizeInventory(responses?.inventoryRaw, nameMaps);
  const fragmentCategories = [
    [heroes, "fragmentHero"],
    [titans, "fragmentTitan"],
    [pets, "fragmentPet"],
  ];
  for (const [entities, category] of fragmentCategories) {
    const amounts = new Map((inventory[category] || []).map(({ id, amount }) => [id, amount]));
    entities.forEach((entity) => { entity.soulStones = amounts.get(entity.id) || 0; });
    delete inventory[category];
  }

  return {
    schemaVersion: 4,
    source: "Hero Wars Dominion Era roster responses",
    exportedAtUtc: exportedAt.toISOString(),
    heroCount: heroes.length,
    titanCount: titans.length,
    petCount: pets.length,
    account: sanitizeAccount(responses?.accountRaw, nameMaps),
    inventory,
    teams: normalizeTeams(responses?.teamsRaw, nameMaps),
    chestProgress: {
      heroArtifact: responses?.artifactChest ?? null,
      titanArtifact: responses?.titanArtifactChest ?? null,
      pet: responses?.petChest ?? null,
    },
    heroes,
    titans,
    pets,
  };
}

/** Merge partial captures as the three batched responses arrive. */
export function mergeRosterResponses(current = {}, incoming = {}) {
  const merged = { ...current };
  for (const collection of Object.values(CALL_TO_DATA)) {
    if (incoming[collection] != null) merged[collection] = incoming[collection];
  }
  return merged;
}

export function isRosterComplete(responses) {
  return Object.values(CALL_TO_COLLECTION).every(
    (collection) => responses?.[collection] != null,
  );
}

/** Download a JSON value without sending it anywhere. */
export function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
