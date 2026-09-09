// Runs in Roblox's MAIN page world, where its native launcher and network
// responses are available.
const rsnObservedServers = new Map();

function rsnPublishServers(servers) {
  for (const server of servers || []) {
    if (server?.id) rsnObservedServers.set(server.id, server);
  }
  window.dispatchEvent(new CustomEvent("rsn-native-server-data", {
    detail: { servers: [...rsnObservedServers.values()] }
  }));
}

function rsnServersFromBody(body) {
  const found = [];
  const seen = new Set();
  function visit(value, depth = 0) {
    if (!value || depth > 5 || seen.has(value)) return;
    if (typeof value !== "object") return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value.id === "string" && Number.isFinite(Number(value.ping))) {
      found.push({ ...value, ping: Number(value.ping) });
      return;
    }
    for (const child of Object.values(value)) visit(child, depth + 1);
  }
  visit(body);
  return found;
}

function rsnPublishCardServers() {
  const servers = [];
  const cards = document.querySelectorAll(".rbx-public-game-server-item");
  for (const card of cards) {
    const sources = [];
    for (const node of [card, ...card.querySelectorAll("*")]) {
      try {
        const ng = window.angular?.element(node);
        sources.push(ng?.scope?.(), ng?.isolateScope?.());
      } catch {}
      try {
        sources.push(window.jQuery?.(node)?.data?.());
      } catch {}
      for (const name of Object.getOwnPropertyNames(node)) {
        if (name.startsWith("__reactProps$") || name.startsWith("__reactFiber$")) {
          try { sources.push(node[name]); } catch {}
        }
      }
    }
    for (const source of sources) servers.push(...rsnServersFromBody(source));
  }
  if (servers.length) rsnPublishServers(servers);
}

function rsnCaptureServerResponse(url, response) {
  const contentType = response.headers?.get("content-type") || "";
  if (!contentType.includes("json")) return;
  response.clone().json().then((body) => {
    const servers = rsnServersFromBody(body);
    if (servers.length) rsnPublishServers(servers);
  }).catch(() => {});
}

const rsnOriginalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await rsnOriginalFetch.apply(this, args);
  rsnCaptureServerResponse(args[0]?.url || args[0], response);
  return response;
};

const rsnOriginalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url, ...rest) {
  this.__rsnUrl = url;
  return rsnOriginalOpen.call(this, method, url, ...rest);
};
const rsnOriginalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function (...args) {
  this.addEventListener("load", () => {
    try {
      const servers = rsnServersFromBody(JSON.parse(this.responseText));
      if (servers.length) rsnPublishServers(servers);
    } catch {}
  }, { once:true });
  return rsnOriginalSend.apply(this, args);
};

window.addEventListener("rsn-request-native-server-data", () => {
  rsnPublishServers([]);
  rsnPublishCardServers();
});

window.addEventListener("rsn-join-game-instance", (event) => {
  const { placeId, serverId } = event.detail || {};
  if (!placeId || !serverId) return;

  if (window.Roblox?.GameLauncher?.joinGameInstance) {
    window.Roblox.GameLauncher.joinGameInstance(String(placeId), String(serverId));
    return;
  }

  window.location.href =
    `roblox://experiences/start?placeId=${encodeURIComponent(placeId)}` +
    `&gameInstanceId=${encodeURIComponent(serverId)}`;
});

// Observe native Roblox Join actions as well, then let the isolated extension
// script persist the last selected instance in chrome.storage.
function observeNativeLauncher() {
  const launcher = window.Roblox?.GameLauncher;
  if (!launcher?.joinGameInstance || launcher.joinGameInstance.__rsnObserved) return false;
  const original = launcher.joinGameInstance;
  function observedJoin(placeId, serverId, ...rest) {
    window.dispatchEvent(new CustomEvent("rsn-game-instance-launched", {
      detail: { placeId: String(placeId), serverId: String(serverId) }
    }));
    return original.call(this, placeId, serverId, ...rest);
  }
  observedJoin.__rsnObserved = true;
  launcher.joinGameInstance = observedJoin;
  return true;
}

if (!observeNativeLauncher()) {
  const launcherTimer = setInterval(() => {
    if (observeNativeLauncher()) clearInterval(launcherTimer);
  }, 500);
  setTimeout(() => clearInterval(launcherTimer), 30000);
}
