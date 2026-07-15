(() => {
  "use strict";
  if (window.__heroWarsSnapshotListener) return;
  window.__heroWarsSnapshotListener = true;

  const EVENT_NAME = "hero-wars-roster-snapshot-v1";
  const API_HOST = "heroes-wb.nextersglobal.com";
  const allowedCalls = new Set([
    "heroGetAll", "titanGetAll", "pet_getAll", "userGetInfo",
    "inventoryGet", "teamGetAll", "artifactGetChestLevel",
    "titanArtifactGetChest", "pet_getChest"
  ]);

  const emit = (kind, payload) => document.dispatchEvent(new CustomEvent(EVENT_NAME, {
    detail: { kind, payload }
  }));

  // Delayed so the isolated-world bridge has time to attach its DOM listener.
  setTimeout(() => emit("LISTENER_READY", { version: 1 }), 0);

  function isGameApi(value) {
    try {
      const url = new URL(value, location.href);
      return url.protocol === "https:" && url.hostname === API_HOST && url.pathname === "/api/";
    } catch {
      return false;
    }
  }

  function inspectBatch(requestText, responseText) {
    try {
      const request = JSON.parse(requestText);
      const response = JSON.parse(responseText);
      const calls = Array.isArray(request?.calls) ? request.calls : [];
      const results = Array.isArray(response?.results) ? response.results : [];
      const safeCalls = [];
      const safeResults = [];

      calls.forEach((call, index) => {
        const ident = call?.ident ?? call?.name;
        if (!allowedCalls.has(ident) || index >= results.length) return;
        safeCalls.push({ ident });
        safeResults.push({ result: { response: results[index]?.result?.response } });
      });

      if (safeCalls.length) emit("API_BATCH", {
        request: { calls: safeCalls },
        response: { results: safeResults }
      });
    } catch {
      // Unrelated or non-JSON traffic is intentionally ignored.
    }
  }

  async function bodyToText(body) {
    if (typeof body === "string") return body;
    if (body instanceof Blob) return body.text();
    if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
    if (ArrayBuffer.isView(body)) {
      return new TextDecoder().decode(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    }
    if (body instanceof URLSearchParams) return body.toString();
    return "";
  }

  const xhrState = new WeakMap();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    xhrState.set(this, { url: String(url), body: "" });
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const state = xhrState.get(this);
    if (state) state.bodyPromise = bodyToText(body);
    this.addEventListener("loadend", async () => {
      const current = xhrState.get(this);
      const requestText = current ? await current.bodyPromise : "";
      if (!current || !isGameApi(current.url) || !requestText) return;
      try {
        const responseText = typeof this.response === "string"
          ? this.response
          : JSON.stringify(this.response);
        emit("API_SEEN", { transport: "xhr", requestLength: requestText.length, responseLength: responseText?.length ?? 0 });
        inspectBatch(requestText, responseText);
      } catch { /* ignored */ }
    }, { once: true });
    return originalSend.apply(this, arguments);
  };

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    const requestBody = init?.body != null
      ? bodyToText(init.body)
      : input instanceof Request ? input.clone().text().catch(() => "") : Promise.resolve("");
    const promise = originalFetch.apply(this, arguments);
    if (isGameApi(url)) {
      Promise.all([requestBody, promise.then(response => response.clone().text())])
        .then(([body, text]) => {
          emit("API_SEEN", { transport: "fetch", requestLength: body.length, responseLength: text.length });
          if (body) inspectBatch(body, text);
        })
        .catch(() => {});
    }
    return promise;
  };

  let attempts = 0;
  const indexTimer = setInterval(() => {
    attempts += 1;
    const vars = window.NXFlashVars;
    const source = vars?.index_url;
    if (source?.lib_index && source?.locales_index && source?.asset_index) {
      emit("INDEX_URLS", {
        library: source.lib_index,
        locales: source.locales_index,
        assets: source.asset_index
      });
      clearInterval(indexTimer);
    } else if (attempts >= 120) {
      clearInterval(indexTimer);
    }
  }, 250);
})();
