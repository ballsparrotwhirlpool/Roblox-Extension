const FEATURE_SETTINGS_KEY = "rsn-feature-settings";
const ICON_FEATURES = ["randomServer", "rejoinServer", "pagination", "serverIdSearch", "playerFilters", "totalControls", "favorites", "avoid", "copyId"];
const ICON_DEFAULTS = Object.fromEntries(ICON_FEATURES.map((feature) => [feature, true]));
let robloxIcon = null;

function drawToolbarIcon(size, state) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  const scale = size / 16;
  const bars = [
    { state:"active", color:"#39a66d", muted:"#68746d" },
    { state:"mixed", color:"#d1841f", muted:"#776f64" },
    { state:"off", color:"#cf514b", muted:"#756766" }
  ];
  bars.forEach((bar,index) => {
    const x = 2 * scale;
    const y = (2 + index * 5) * scale;
    const width = 12 * scale;
    const height = 3 * scale;
    const radius = 1.5 * scale;
    context.beginPath();
    context.roundRect(x,y,width,height,radius);
    context.fillStyle = state === bar.state ? bar.color : bar.muted;
    context.fill();
  });
  return context.getImageData(0, 0, size, size);
}

function updateToolbarIcon(savedSettings = {}) {
  const settings = { ...ICON_DEFAULTS, ...savedSettings };
  const active = ICON_FEATURES.filter((feature) => settings[feature] !== false).length;
  const state = active === ICON_FEATURES.length ? "active" : active === 0 ? "off" : "mixed";
  robloxIcon = {
    16: drawToolbarIcon(16, state),
    32: drawToolbarIcon(32, state)
  };
  chrome.action.setIcon({
    imageData: {
      16: drawToolbarIcon(16, "off"),
      32: drawToolbarIcon(32, "off")
    }
  });
  chrome.action.setTitle({ title:`Roblox Server Navigator — ${active} of ${ICON_FEATURES.length} active` });
}

function refreshToolbarIcon() {
  chrome.storage.local.get(FEATURE_SETTINGS_KEY, (result) => updateToolbarIcon(result[FEATURE_SETTINGS_KEY] || {}));
}

chrome.runtime.onInstalled.addListener(refreshToolbarIcon);
chrome.runtime.onStartup.addListener(refreshToolbarIcon);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[FEATURE_SETTINGS_KEY]) {
    updateToolbarIcon(changes[FEATURE_SETTINGS_KEY].newValue || {});
  }
});
refreshToolbarIcon();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "loading") return;
  chrome.action.setIcon({
    tabId,
    imageData: {
      16: drawToolbarIcon(16, "off"),
      32: drawToolbarIcon(32, "off")
    }
  });
});

async function fetchRobloxJson(url, options = {}, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response.json();
      if (response.status !== 429 && response.status < 500) {
        const error = new Error(`Roblox returned error ${response.status}`);
        error.nonRetryable = true;
        throw error;
      }
      lastError = new Error(`Roblox returned error ${response.status}`);
    } catch (error) {
      if (error.nonRetryable) throw error;
      lastError = error;
    }
    if (attempt < attempts - 1) {
      const delay = 400 * (2 ** attempt) + Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ROBLOX_PAGE_ACTIVE" && sender.tab?.id !== undefined) {
    const tabId = sender.tab.id;
    if (robloxIcon) {
      chrome.action.setIcon({ tabId, imageData:robloxIcon });
    } else {
      chrome.storage.local.get(FEATURE_SETTINGS_KEY, (result) => {
        updateToolbarIcon(result[FEATURE_SETTINGS_KEY] || {});
        chrome.action.setIcon({ tabId, imageData:robloxIcon });
      });
    }
    sendResponse({ success:true });
    return;
  }

  if (message.type === "GET_GAME_PLAYER_COUNT") {
    (async () => {
      try {
        const universe = await fetchRobloxJson(
          `https://apis.roblox.com/universes/v1/places/${message.placeId}/universe`
        );
        const game = await fetchRobloxJson(
          `https://games.roblox.com/v1/games?universeIds=${universe.universeId}`
        );
        sendResponse({ success: true, playing: Number(game.data?.[0]?.playing) || 0 });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === "SEARCH_SERVER_ID") {
    (async () => {
      try {
        const query = String(message.serverId || "").toLowerCase();
        let cursor = null;
        let pages = 0;
        do {
          const params = new URLSearchParams({ sortOrder:"Desc", excludeFullGames:"false", limit:"100" });
          if (cursor) params.set("cursor", cursor);
          const data = await fetchRobloxJson(`https://games.roblox.com/v1/games/${message.placeId}/servers/Public?${params}`);
          const server = (data.data || []).find((item) => {
            const id = String(item.id || "").toLowerCase();
            return id === query || `${id.slice(0,4)}-${id.slice(-4)}` === query;
          });
          if (server) {
            sendResponse({ success:true, server, capped:false });
            return;
          }
          cursor = data.nextPageCursor || null;
          pages += 1;
        } while (cursor && pages < 100);
        sendResponse({ success:true, server:null, capped:Boolean(cursor) });
      } catch (error) {
        sendResponse({ success:false, error:error.message });
      }
    })();
    return true;
  }

  if (message.type === "GET_SERVER_TOTAL") {
    (async () => {
      try {
        const pageSize = Math.max(1, Number(message.pageSize) || 12);
        const automaticLimit = 100 * pageSize;
        let cursor = null;
        let serverCount = 0;

        do {
          const query = new URLSearchParams({
            sortOrder: "Desc",
            excludeFullGames: String(message.excludeFullGames !== false),
            limit: "100"
          });
          if (cursor) query.set("cursor", cursor);

          const data = await fetchRobloxJson(
            `https://games.roblox.com/v1/games/${message.placeId}/servers/Public?${query}`
          );
          serverCount += data.data?.length || 0;
          cursor = data.nextPageCursor || null;

          if (!message.unlimited && serverCount >= automaticLimit && cursor) {
            sendResponse({ success: true, pages: 100, capped: true });
            return;
          }
        } while (cursor);

        sendResponse({
          success: true,
          pages: Math.max(1, Math.ceil(serverCount / pageSize)),
          capped: false
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type !== "GET_PUBLIC_SERVERS") {
    return;
  }

  const placeId = message.placeId;

  const query = new URLSearchParams({
    sortOrder: "Desc",
    excludeFullGames: "true",
    limit: String(Math.min(100, Math.max(10, Number(message.limit) || 100)))
  });

  if (message.cursor) {
    query.set("cursor", message.cursor);
  }

  const serverUrl =
    `https://games.roblox.com/v1/games/${placeId}/servers/Public?${query}`;

  fetchRobloxJson(serverUrl)
    .then((serverData) => {
      sendResponse({
        success: true,
        servers: serverData.data,
        nextPageCursor: serverData.nextPageCursor || null
      });
    })
    .catch((error) => {
      sendResponse({
        success: false,
        error: error.message
      });
    });

  return true;
});
