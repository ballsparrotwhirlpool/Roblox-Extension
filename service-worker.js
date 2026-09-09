const FEATURE_SETTINGS_KEY = "rsn-feature-settings";
const ICON_FEATURES = ["randomServer", "rejoinServer", "pagination", "playerFilters", "totalControls", "favorites", "avoid", "copyId"];
const ICON_DEFAULTS = Object.fromEntries(ICON_FEATURES.map((feature) => [feature, true]));
let robloxIcon = null;

function drawToolbarIcon(size, color) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  const inset = Math.max(1, Math.round(size * .06));
  const radius = Math.round(size * .24);
  const left = inset;
  const top = inset;
  const right = size - inset;
  const bottom = size - inset;

  context.beginPath();
  context.moveTo(left + radius, top);
  context.lineTo(right - radius, top);
  context.quadraticCurveTo(right, top, right, top + radius);
  context.lineTo(right, bottom - radius);
  context.quadraticCurveTo(right, bottom, right - radius, bottom);
  context.lineTo(left + radius, bottom);
  context.quadraticCurveTo(left, bottom, left, bottom - radius);
  context.lineTo(left, top + radius);
  context.quadraticCurveTo(left, top, left + radius, top);
  context.closePath();
  context.fillStyle = color;
  context.fill();

  context.fillStyle = "#ffffff";
  const unit = size / 16;
  context.fillRect(4 * unit, 3 * unit, 2 * unit, 10 * unit);
  context.fillRect(6 * unit, 3 * unit, 4 * unit, 2 * unit);
  context.fillRect(6 * unit, 7 * unit, 4 * unit, 2 * unit);
  context.fillRect(9 * unit, 4 * unit, 2 * unit, 4 * unit);
  context.beginPath();
  context.moveTo(7 * unit, 8 * unit);
  context.lineTo(11 * unit, 13 * unit);
  context.lineWidth = 2 * unit;
  context.lineCap = "square";
  context.strokeStyle = "#ffffff";
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

function updateToolbarIcon(savedSettings = {}) {
  const settings = { ...ICON_DEFAULTS, ...savedSettings };
  const active = ICON_FEATURES.filter((feature) => settings[feature] !== false).length;
  const color = active === ICON_FEATURES.length ? "#2f7654" : active === 0 ? "#c7504a" : "#d1841f";
  robloxIcon = {
    16: drawToolbarIcon(16, color),
    32: drawToolbarIcon(32, color)
  };
  chrome.action.setIcon({
    imageData: {
      16: drawToolbarIcon(16, "#c7504a"),
      32: drawToolbarIcon(32, "#c7504a")
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
      16: drawToolbarIcon(16, "#c7504a"),
      32: drawToolbarIcon(32, "#c7504a")
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
        throw new Error(`Roblox returned error ${response.status}`);
      }
      lastError = new Error(`Roblox returned error ${response.status}`);
    } catch (error) {
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

  if (message.type === "GET_PLAYER_THUMBNAILS") {
    const tokens = [...new Set(message.tokens || [])].slice(0, 100);
    const requests = tokens.map((token, index) => ({
      requestId: String(index),
      token,
      type: "AvatarHeadShot",
      size: "150x150",
      format: "png",
      isCircular: false
    }));
    if (!requests.length) { sendResponse({ success: true, thumbnails: {} }); return; }
    (async () => {
      try {
        const thumbnails = {};
        let pendingRequests = requests;

        for (let attempt = 0; attempt < 5 && pendingRequests.length; attempt += 1) {
          if (attempt) await new Promise((resolve) => setTimeout(resolve, 450));
          const response = await fetch("https://thumbnails.roblox.com/v1/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pendingRequests)
          });
          if (!response.ok) throw new Error(`Roblox returned error ${response.status}`);

          const result = await response.json();
          const stillPending = new Set();
          for (const item of result.data || []) {
            const token = tokens[Number(item.requestId)];
            if (token && item.state === "Completed" && item.imageUrl) {
              thumbnails[token] = item.imageUrl;
            } else if (item.state === "Pending") {
              stillPending.add(item.requestId);
            }
          }
          pendingRequests = requests.filter((request) => stillPending.has(request.requestId));
        }

        sendResponse({ success: true, thumbnails });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
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
