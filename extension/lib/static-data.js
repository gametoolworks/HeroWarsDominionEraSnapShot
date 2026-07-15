/** Read JSON that may be returned as ordinary bytes or as a raw gzip file. */
export async function decodeJsonResponse(response) {
  if (!response.ok) {
    throw new Error(`Static data request failed with HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (!isGzip) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

/**
 * Follow an official index to its current hashed data file. Both requests are
 * ordinary public static-data reads and contain no account credentials.
 */
export async function fetchIndexedJson(indexUrl, preferredEntry) {
  const index = await decodeJsonResponse(await fetch(indexUrl, { credentials: "omit" }));
  const entry = index[`${preferredEntry}.gz`] ?? index[preferredEntry];
  if (!entry?.path) throw new Error(`Missing ${preferredEntry} in static index`);

  const dataUrl = new URL(entry.path, indexUrl).href;
  return decodeJsonResponse(await fetch(dataUrl, { credentials: "omit" }));
}

function portraitLogicalPath(entity) {
  if (entity.entityType === "hero") return `hero_icons_big/${entity.id}.png`;
  if (entity.entityType === "titan") return `titan_icons_big/titan_big_${entity.id}.png`;
  if (entity.entityType === "pet") return `pet_icons_big/pet_${entity.id}.png`;
  return null;
}

/** Resolve official portrait URLs from the game's current asset index. */
export function buildPortraitUrls(assetIndex, assetBaseUrl, snapshot) {
  const portraits = {};
  for (const collection of ["heroes", "titans", "pets"]) {
    for (const entity of snapshot?.[collection] ?? []) {
      const logicalPath = portraitLogicalPath(entity);
      const hashedPath = logicalPath && assetIndex?.[logicalPath]?.path;
      if (hashedPath) portraits[`${entity.entityType}:${entity.id}`] = new URL(hashedPath, assetBaseUrl).href;
    }
  }
  return portraits;
}

/** Resolve standalone inventory icons where the game publishes them. */
export function buildInventoryIconUrls(library, assetIndex, assetBaseUrl, snapshot) {
  const icons = {};
  for (const [category, items] of Object.entries(snapshot?.inventory ?? {})) {
    for (const item of items) {
      let logicalPath = null;
      if (category === "consumable") {
        const texture = library?.inventoryItem?.consumable?.[String(item.id)]?.assetTexture;
        if (texture) logicalPath = `inventory_icons/consumable/${texture}.png`;
      }
      const hashedPath = logicalPath && assetIndex?.[logicalPath]?.path;
      if (hashedPath) icons[`${category}:${item.id}`] = new URL(hashedPath, assetBaseUrl).href;
    }
  }
  return icons;
}

const CATEGORY_DEFINITION = Object.freeze({
  consumable: "consumable",
  gear: "gear",
  fragmentGear: "gear",
  scroll: "scroll",
  fragmentScroll: "scroll",
  coin: "coin",
  ascensionGear: "ascensionGear",
  petGear: "petGear",
});

function assetEntryByFilename(assetIndex, filename) {
  return Object.entries(assetIndex ?? {}).find(([logical]) => logical.endsWith(`/${filename}`))?.[1];
}

export function buildOverviewIconUrls(assetIndex, assetBaseUrl) {
  const logical = {
    stamina: "inventory_icons/consumable/energy_bottle.png",
    petChest: "inventory_icons/consumable/pet_chest.png",
  };
  const icons = {};
  for (const [key, path] of Object.entries(logical)) {
    const hashed = assetIndex?.[path]?.path;
    if (hashed) icons[key] = new URL(hashed, assetBaseUrl).href;
  }
  return icons;
}

function parseAtlasXml(xml) {
  const entries = {};
  for (const tag of xml.matchAll(/<SubTexture\b([^>]+)>?/g)) {
    const attributes = {};
    for (const attribute of tag[1].matchAll(/([\w]+)="([^"]*)"/g)) {
      attributes[attribute[1]] = attribute[2];
    }
    if (attributes.name) {
      entries[attributes.name] = {
        x: Number(attributes.x || 0),
        y: Number(attributes.y || 0),
        width: Number(attributes.width || 0),
        height: Number(attributes.height || 0),
      };
    }
  }
  return entries;
}

/**
 * Resolve both standalone icons and sprites stored in official texture atlases.
 * Returned values are either URL strings or sprite descriptors.
 */
export async function buildInventoryVisuals(library, assetIndex, assetBaseUrl, snapshot) {
  const visuals = buildInventoryIconUrls(library, assetIndex, assetBaseUrl, snapshot);
  const atlasCache = new Map();

  for (const [category, items] of Object.entries(snapshot?.inventory ?? {})) {
    const definitionCategory = CATEGORY_DEFINITION[category];
    if (!definitionCategory) continue;

    for (const item of items) {
      const visualKey = `${category}:${item.id}`;
      if (visuals[visualKey]) continue;
      const definition = library?.inventoryItem?.[definitionCategory]?.[String(item.id)];
      const atlasId = definition?.assetAtlas;
      const textureName = definition?.assetTexture;
      const atlasDefinition = library?.asset?.inventory?.[String(atlasId)];
      if (!textureName || !atlasDefinition?.atlas || !atlasDefinition?.texture) continue;

      const cacheKey = String(atlasId);
      if (!atlasCache.has(cacheKey)) {
        atlasCache.set(cacheKey, (async () => {
          const xmlEntry = assetEntryByFilename(assetIndex, atlasDefinition.atlas);
          const textureEntry = assetEntryByFilename(assetIndex, atlasDefinition.texture);
          if (!xmlEntry?.path || !textureEntry?.path) return null;
          const xmlUrl = new URL(xmlEntry.path, assetBaseUrl).href;
          const response = await fetch(xmlUrl, { credentials: "omit" });
          if (!response.ok) return null;
          return {
            sprites: parseAtlasXml(await response.text()),
            imageUrl: new URL(textureEntry.path, assetBaseUrl).href,
          };
        })());
      }

      const atlas = await atlasCache.get(cacheKey);
      const sprite = atlas?.sprites?.[textureName];
      if (sprite?.width && sprite?.height) {
        visuals[visualKey] = { ...sprite, imageUrl: atlas.imageUrl };
      }
    }
  }
  return visuals;
}

export function addSpecialInventoryVisuals(visuals, layouts, library, assetIndex, assetBaseUrl, snapshot) {
  const groups = {
    fragmentArtifact: { definition: library?.artifact?.id, layout: "artifact", image: "js/gui/artifact_icons0.png" },
    fragmentTitanArtifact: { definition: library?.titanArtifact?.id, layout: "titanArtifact", image: "js/gui/titan_artifact_icons0.png" },
    petGear: { definition: library?.inventoryItem?.petGear, layout: "petGear", image: "js/gui/pet_gear0.png" },
  };
  for (const [category, config] of Object.entries(groups)) {
    const imagePath = assetIndex?.[config.image]?.path;
    if (!imagePath) continue;
    for (const item of snapshot?.inventory?.[category] ?? []) {
      const texture = config.definition?.[String(item.id)]?.assetTexture;
      const sprite = texture && layouts?.[config.layout]?.[texture];
      if (sprite) visuals[`${category}:${item.id}`] = {
        ...sprite,
        imageUrl: new URL(imagePath, assetBaseUrl).href,
      };
    }
  }
  return visuals;
}
