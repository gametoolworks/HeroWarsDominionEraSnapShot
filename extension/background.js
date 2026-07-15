import {
  addDefinitionNames, buildNameMaps, buildRosterSnapshot, extractRosterResponses,
  isRosterComplete, mergeRosterResponses
} from "./lib/roster.js";
import {
  addSpecialInventoryVisuals, buildInventoryVisuals, buildOverviewIconUrls,
  buildPortraitUrls, decodeJsonResponse, fetchIndexedJson
} from "./lib/static-data.js";

const HERO_WARS_HOST = "www.hero-wars.com";
const STATIC_HOSTS = new Set([
  "heroeswb-a-cdn.nextersglobal.com",
  "heroeswb-a-v2.akamaized.net",
  "d25cbez24ewnva.cloudfront.net"
]);
let finalizing = false;
let finalizeTimer;

function isHeroWarsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === HERO_WARS_HOST;
  } catch { return false; }
}

function validateIndexUrls(value) {
  const output = {};
  for (const key of ["library", "locales", "assets"]) {
    const url = new URL(value?.[key]);
    if (url.protocol !== "https:" || !STATIC_HOSTS.has(url.hostname)) {
      throw new Error(`Rejected untrusted ${key} data URL.`);
    }
    output[key] = url.href;
  }
  return output;
}

async function setStatus(state, message) {
  await chrome.storage.local.set({ captureStatus: { state, message, updatedAt: new Date().toISOString() } });
  await chrome.action.setBadgeText({ text: state === "complete" ? "✓" : state === "error" ? "!" : "…" });
  await chrome.action.setBadgeBackgroundColor({ color: state === "complete" ? "#16845b" : state === "error" ? "#b91c1c" : "#2563eb" });
}

async function tryFinalize() {
  if (finalizing) return;
  const stored = await chrome.storage.local.get(["pendingCaptureData", "pendingIndexUrls", "captureStatus"]);
  if (stored.captureStatus?.state !== "capturing" || !isRosterComplete(stored.pendingCaptureData) || !stored.pendingIndexUrls) return;

  finalizing = true;
  await setStatus("finalizing", "Building your local snapshot…");
  try {
    const urls = validateIndexUrls(stored.pendingIndexUrls);
    const [locale, library, assetIndex, layouts] = await Promise.all([
      fetchIndexedJson(urls.locales, "en.json"),
      fetchIndexedJson(urls.library, "lib.json"),
      decodeJsonResponse(await fetch(urls.assets, { credentials: "omit" })),
      fetch(chrome.runtime.getURL("assets/sprite-layouts.json")).then(response => response.json())
    ]);
    const names = addDefinitionNames(buildNameMaps(locale), library);
    const snapshot = buildRosterSnapshot(stored.pendingCaptureData, names);
    const assetBase = new URL("./", urls.assets).href;
    const portraits = buildPortraitUrls(assetIndex, assetBase, snapshot);
    const inventory = await buildInventoryVisuals(library, assetIndex, assetBase, snapshot);
    addSpecialInventoryVisuals(inventory, layouts, library, assetIndex, assetBase, snapshot);
    const overview = buildOverviewIconUrls(assetIndex, assetBase);
    overview.gold = chrome.runtime.getURL("assets/gold.png");
    overview.emeralds = chrome.runtime.getURL("assets/emerald.png");

    await chrome.storage.local.set({
      latestRosterSnapshot: snapshot,
      latestPortraitUrls: portraits,
      latestInventoryIconUrls: inventory,
      latestOverviewIconUrls: overview
    });
    await chrome.storage.local.remove(["pendingCaptureData", "pendingIndexUrls"]);
    await setStatus("complete", `Snapshot captured: ${snapshot.heroes.length} heroes, ${snapshot.titans.length} titans, ${snapshot.pets.length} pets.`);
    await chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
  } catch (error) {
    await setStatus("error", error?.message ?? "Snapshot creation failed.");
  } finally {
    finalizing = false;
  }
}

function scheduleFinalize() {
  clearTimeout(finalizeTimer);
  finalizeTimer = setTimeout(() => { tryFinalize().catch(() => {}); }, 2500);
}

function capturedLabels(data) {
  const labels = [];
  if (data?.heroes) labels.push("Heroes");
  if (data?.titans) labels.push("Titans");
  if (data?.pets) labels.push("Pets");
  if (data?.accountRaw) labels.push("Account");
  if (data?.inventoryRaw) labels.push("Inventory");
  if (data?.teamsRaw) labels.push("Teams");
  return labels;
}

async function handleMessage(message, sender) {
  if (message?.type === "RESET_CAPTURE") {
    const tab = await chrome.tabs.get(message.tabId);
    if (!isHeroWarsUrl(tab.url)) throw new Error("Capture can only start on www.hero-wars.com.");
    await chrome.storage.local.remove(["pendingCaptureData", "pendingIndexUrls"]);
    clearTimeout(finalizeTimer);
    await setStatus("capturing", "Waiting for Hero Wars account data…");
    return { ok: true };
  }

  if (!isHeroWarsUrl(sender.tab?.url)) throw new Error("Ignored message from outside www.hero-wars.com.");
  const status = (await chrome.storage.local.get("captureStatus")).captureStatus;
  if (status?.state !== "capturing") return { ok: false, reason: "No capture is active." };

  if (message.type === "BRIDGE_READY") {
    await setStatus("capturing", "Extension bridge loaded; checking the page listener…");
    return { ok: true };
  } else if (message.type === "LISTENER_READY") {
    await setStatus("capturing", "Page listener connected; waiting for Hero Wars API data…");
    return { ok: true };
  } else if (message.type === "API_SEEN") {
    await setStatus("capturing", `Hero Wars API response detected via ${message.payload?.transport}; looking for roster calls…`);
    return { ok: true };
  } else if (message.type === "INDEX_URLS") {
    await chrome.storage.local.set({ pendingIndexUrls: validateIndexUrls(message.payload) });
  } else if (message.type === "API_BATCH") {
    const incoming = extractRosterResponses(message.payload?.request, message.payload?.response);
    const current = (await chrome.storage.local.get("pendingCaptureData")).pendingCaptureData;
    const merged = mergeRosterResponses(current, incoming);
    await chrome.storage.local.set({ pendingCaptureData: merged });
    const received = capturedLabels(merged);
    await setStatus("capturing", received.length
      ? `Received: ${received.join(", ")}. Waiting for remaining data…`
      : "Connected to the game API; waiting for roster data…");
  } else {
    return { ok: false };
  }
  scheduleFinalize();
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(error => sendResponse({ ok: false, error: error?.message }));
  return true;
});
