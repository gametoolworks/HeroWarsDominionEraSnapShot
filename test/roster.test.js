import assert from "node:assert/strict";
import test from "node:test";

import {
  addDefinitionNames,
  buildNameMaps,
  buildRosterSnapshot,
  extractRosterResponses,
  isRosterComplete,
  mergeRosterResponses,
} from "../extension/lib/roster.js";
import { buildInventoryIconUrls, buildInventoryVisuals, buildPortraitUrls } from "../extension/lib/static-data.js";

test("aligns roster calls with results in a batched response", () => {
  const request = {
    calls: [
      { ident: "unrelated" },
      { ident: "heroGetAll" },
      { ident: "pet_getAll" },
      { ident: "titanGetAll" },
    ],
  };
  const response = {
    results: [
      { result: { response: "ignored" } },
      { result: { response: { 4: { id: 4 } } } },
      { result: { response: [{ id: 6000 }] } },
      { result: { response: { 4000: { id: 4000 } } } },
    ],
  };

  assert.deepEqual(extractRosterResponses(request, response), {
    heroes: { 4: { id: 4 } },
    pets: [{ id: 6000 }],
    titans: { 4000: { id: 4000 } },
  });
});

test("builds typed name maps from official localization keys", () => {
  assert.deepEqual(
    buildNameMaps({
      LIB_HERO_NAME_4: "Astaroth",
      LIB_HERO_NAME_4000: "Sigurd",
      LIB_HERO_NAME_6000: "Fenris",
      SOMETHING_ELSE: "Ignored",
    }),
    {
      heroes: { 4: "Astaroth" },
      titans: { 4000: "Sigurd" },
      pets: { 6000: "Fenris" },
      items: {},
      resources: {},
    },
  );
});

test("adds refillable resource identifiers from official definitions", () => {
  const maps = addDefinitionNames(buildNameMaps({}), {
    refillable: { 1: { ident: "stamina" }, 2: { ident: "skill_point" } },
  });
  assert.deepEqual(maps.resources, { 1: "stamina", 2: "skill_point" });
});

test("normalizes and sorts all three collections", () => {
  const snapshot = buildRosterSnapshot(
    {
      heroes: { 16: { id: 16, level: 10 }, 4: { id: 4, level: 20 } },
      titans: { 4000: { id: 4000, power: 123 } },
      pets: [{ id: 6000, star: 3 }],
    },
    {
      heroes: { 4: "Astaroth", 16: "Dante" },
      titans: { 4000: "Sigurd" },
      pets: { 6000: "Fenris" },
    },
    new Date("2026-07-14T12:00:00.000Z"),
  );

  assert.equal(snapshot.schemaVersion, 4);
  assert.deepEqual(snapshot.heroes.map(({ id, name }) => ({ id, name })), [
    { id: 4, name: "Astaroth" },
    { id: 16, name: "Dante" },
  ]);
  assert.equal(snapshot.titans[0].entityType, "titan");
  assert.equal(snapshot.pets[0].name, "Fenris");
  assert.equal(snapshot.exportedAtUtc, "2026-07-14T12:00:00.000Z");
});

test("merges partial captures and detects completeness", () => {
  let responses = mergeRosterResponses({}, { heroes: {} });
  assert.equal(isRosterComplete(responses), false);
  responses = mergeRosterResponses(responses, { titans: {}, pets: [] });
  assert.equal(isRosterComplete(responses), true);
});

test("resolves official portraits from the asset index", () => {
  const portraits = buildPortraitUrls(
    {
      "hero_icons_big/4.png": { path: "hero_icons_big/4.hash.png" },
      "titan_icons_big/titan_big_4000.png": { path: "titan_icons_big/titan_big_4000.hash.png" },
      "pet_icons_big/pet_6000.png": { path: "pet_icons_big/pet_6000.hash.png" },
    },
    "https://cdn.example/assets/",
    {
      heroes: [{ id: 4, entityType: "hero" }],
      titans: [{ id: 4000, entityType: "titan" }],
      pets: [{ id: 6000, entityType: "pet" }],
    },
  );

  assert.deepEqual(portraits, {
    "hero:4": "https://cdn.example/assets/hero_icons_big/4.hash.png",
    "titan:4000": "https://cdn.example/assets/titan_icons_big/titan_big_4000.hash.png",
    "pet:6000": "https://cdn.example/assets/pet_icons_big/pet_6000.hash.png",
  });
});

test("resolves available standalone consumable icons", () => {
  const icons = buildInventoryIconUrls(
    { inventoryItem: { consumable: { 1: { assetTexture: "rune1" } } } },
    { "inventory_icons/consumable/rune1.png": { path: "inventory_icons/consumable/rune1.hash.png" } },
    "https://cdn.example/assets/",
    { inventory: { consumable: [{ id: 1 }] } },
  );
  assert.deepEqual(icons, {
    "consumable:1": "https://cdn.example/assets/inventory_icons/consumable/rune1.hash.png",
  });
});

test("resolves inventory sprites from official atlas metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    '<TextureAtlas><SubTexture name="gear_5" x="10" y="20" width="80" height="80"/></TextureAtlas>',
  );
  try {
    const visuals = await buildInventoryVisuals(
      {
        inventoryItem: { gear: { 3: { assetAtlas: 3, assetTexture: "gear_5" } } },
        asset: { inventory: { 3: { atlas: "gear.xml", texture: "gear.png" } } },
      },
      {
        "inventory_icons/gear.xml": { path: "inventory_icons/gear.hash.xml" },
        "inventory_icons/gear.png": { path: "inventory_icons/gear.hash.png" },
      },
      "https://cdn.example/assets/",
      { inventory: { gear: [{ id: 3 }] } },
    );
    assert.deepEqual(visuals["gear:3"], {
      x: 10,
      y: 20,
      width: 80,
      height: 80,
      imageUrl: "https://cdn.example/assets/inventory_icons/gear.hash.png",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sanitized snapshots contain no request credentials", () => {
  const responses = {
    heroes: { 4: { id: 4, level: 10 } },
    titans: { 4000: { id: 4000, level: 5 } },
    pets: { 6000: { id: 6000, level: 3 } },
  };
  const snapshot = buildRosterSnapshot(responses, {
    heroes: { 4: "Example Hero" },
    titans: { 4000: "Example Titan" },
    pets: { 6000: "Example Pet" },
  });

  assert.equal(isRosterComplete(responses), true);
  assert.equal(
    /auth_key|session_id|access_token|email|cookie|csrf|user_hash/i.test(JSON.stringify(snapshot)),
    false,
  );
});
