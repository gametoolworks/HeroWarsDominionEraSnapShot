(() => {
  "use strict";
  if (location.protocol !== "https:" || location.hostname !== "www.hero-wars.com") return;

  chrome.runtime.sendMessage({ type: "BRIDGE_READY" }).catch(() => {});

  document.addEventListener("hero-wars-roster-snapshot-v1", event => {
    const detail = event.detail;
    if (!detail || !["API_BATCH", "INDEX_URLS", "LISTENER_READY", "API_SEEN"].includes(detail.kind)) return;
    chrome.runtime.sendMessage({ type: detail.kind, payload: detail.payload }).catch(() => {});
  });
})();
