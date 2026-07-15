const captureButton = document.querySelector("#capture");
const openButton = document.querySelector("#open");
const supportButton = document.querySelector("#support");
const siteMessage = document.querySelector("#site-message");
const status = document.querySelector("#status");

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const isHeroWars = (() => {
  try {
    const url = new URL(tab?.url ?? "");
    return url.protocol === "https:" && url.hostname === "www.hero-wars.com";
  } catch { return false; }
})();

captureButton.disabled = !isHeroWars;
siteMessage.textContent = isHeroWars
  ? "Ready to refresh the game and capture its latest data."
  : "Open www.hero-wars.com to create a new snapshot.";

const stored = await chrome.storage.local.get(["latestRosterSnapshot", "captureStatus"]);
openButton.disabled = !stored.latestRosterSnapshot;
status.textContent = stored.captureStatus?.message ?? "";

captureButton.addEventListener("click", async () => {
  captureButton.disabled = true;
  status.textContent = "Refreshing Hero Wars and waiting for account data…";
  try {
    await chrome.runtime.sendMessage({ type: "RESET_CAPTURE", tabId: tab.id });
    await chrome.tabs.reload(tab.id, { bypassCache: true });
    window.close();
  } catch (error) {
    status.textContent = error?.message ?? "Could not start capture.";
    captureButton.disabled = false;
  }
});

openButton.addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
  window.close();
});

supportButton.addEventListener("click", async () => {
  await chrome.tabs.create({ url: "https://buymeacoffee.com/gametoolworks" });
  window.close();
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.captureStatus) status.textContent = changes.captureStatus.newValue?.message ?? "";
  if (changes.latestRosterSnapshot?.newValue) openButton.disabled = false;
});
