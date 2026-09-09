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
