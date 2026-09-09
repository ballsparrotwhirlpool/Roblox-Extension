console.log("Roblox Server Navigator native integration loaded!");

const PAGE_SIZE = 8;
const TOTAL_BLOCK = 100;
const LARGE_GAME_PLAYER_THRESHOLD = 10000;
const FEATURE_SETTINGS_KEY = "rsn-feature-settings";
const DEFAULT_FEATURE_SETTINGS = {
  randomServer:true,
  rejoinServer:true,
  pagination:true,
  playerFilters:true,
  minPlayers:0,
  maxPlayers:null,
  totalControls:true,
  favorites:true,
  avoid:true,
  copyId:true
};
const featureSettings = { ...DEFAULT_FEATURE_SETTINGS };

function setFeatureVisible(element, visible) {
  if (element) element.style.setProperty("display", visible ? "" : "none", "important");
}

function applyFeatureVisibility() {
  setFeatureVisible(document.querySelector("#rsn-random-server"), featureSettings.randomServer);
  setFeatureVisible(document.querySelector("#rsn-last-server"), featureSettings.rejoinServer);
  setFeatureVisible(document.querySelector("#rsn-native-pager .rsn-navigation"), featureSettings.pagination);
  const nativeSection = findSection();
  const nativeMore = nativeSection && loadMoreButton(nativeSection);
  if (nativeMore) {
    nativeMore.dataset.rsnNativeMore = "true";
    setFeatureVisible(nativeMore, !featureSettings.pagination);
  }
  document.querySelectorAll("#rsn-native-pager .rsn-page-jump-control").forEach((element) =>
    setFeatureVisible(element, featureSettings.pagination)
  );
  setFeatureVisible(document.querySelector("#rsn-native-pager .rsn-filters"), featureSettings.playerFilters || featureSettings.favorites);
  document.querySelectorAll('#rsn-native-pager [data-filter="min"],#rsn-native-pager [data-filter="max"],#rsn-native-pager [data-action="filter-search"],#rsn-native-pager [data-action="filter-reset"]').forEach((element) =>
    setFeatureVisible(element.closest("label") || element, featureSettings.playerFilters)
  );
  setFeatureVisible(document.querySelector('#rsn-native-pager [data-filter="favorites"]')?.closest("label"), featureSettings.favorites);
  setFeatureVisible(document.querySelector('#rsn-native-pager [data-jump="last"]'), featureSettings.totalControls && featureSettings.pagination);
  setFeatureVisible(document.querySelector('#rsn-native-pager [data-action="refresh"]'), featureSettings.totalControls);
  setFeatureVisible(document.querySelector('#rsn-native-pager [data-action="clear-avoided"]'), featureSettings.avoid);
  document.querySelectorAll('[data-tool="favorite"]').forEach((element) => setFeatureVisible(element, featureSettings.favorites));
  document.querySelectorAll('[data-tool="avoid"]').forEach((element) => setFeatureVisible(element, featureSettings.avoid));
  document.querySelectorAll('[data-tool="copy"]').forEach((element) => setFeatureVisible(element, featureSettings.copyId));
  document.querySelectorAll(".rsn-card-tools").forEach((row) => {
    const hasVisibleButton = [...row.querySelectorAll("button")].some((button) => button.style.display !== "none");
    setFeatureVisible(row, hasVisibleButton || !row.querySelector(".rsn-ping")?.hidden);
  });
}

chrome.storage.local.get(FEATURE_SETTINGS_KEY, (result) => {
  Object.assign(featureSettings, result[FEATURE_SETTINGS_KEY] || {});
  applyFeatureVisibility();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[FEATURE_SETTINGS_KEY]) return;
  Object.assign(featureSettings, DEFAULT_FEATURE_SETTINGS, changes[FEATURE_SETTINGS_KEY].newValue || {});
  applyFeatureVisibility();
  window.dispatchEvent(new CustomEvent("rsn-feature-settings-changed"));
});

const sendMessage = (message) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    if (!response?.success) return reject(new Error(response?.error || "Roblox request failed."));
    resolve(response);
  });
});

function getPlaceId() {
  return location.pathname.match(/^\/games\/(\d+)/)?.[1] || null;
}

function exactText(root, selector, text) {
  return [...root.querySelectorAll(selector)].filter(
    (element) => element.textContent.trim().toLowerCase() === text.toLowerCase()
  );
}

function findSection() {
  const heading = [...document.querySelectorAll("h1,h2,h3,h4,div,span")].find(
    (element) => element.children.length === 0 && element.textContent.trim() === "Other Servers"
  );
  if (!heading) return null;
  let node = heading.parentElement;
  for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
    if (exactText(node, "button,a,[role='button']", "Load More").length) return node;
  }
  return null;
}

function loadMoreButton(section) {
  return exactText(section, "button,a,[role='button']", "Load More")[0] || null;
}

function serverCards(section) {
  const knownSelectors = [
    ".rbx-game-server-item",
    "[data-testid='game-server-item']",
    "[class*='game-server-item']"
  ];
  for (const selector of knownSelectors) {
    const matches = [...section.querySelectorAll(selector)].filter(
      (element) => exactText(element, "button,a,[role='button']", "Join").length === 1
    );
    if (matches.length) return [...new Set(matches)];
  }

  const cards = [];
  for (const join of exactText(section, "button,a,[role='button']", "Join")) {
    let node = join.parentElement;
    let card = null;
    for (let depth = 0; node && node !== section && depth < 9; depth += 1, node = node.parentElement) {
      const joins = exactText(node, "button,a,[role='button']", "Join").length;
      if (joins > 1) break;
      if (joins === 1 && (/\bID\s*:/i.test(node.textContent) || /people max/i.test(node.textContent))) card = node;
    }
    if (card && !cards.includes(card)) cards.push(card);
  }
  return cards;
}

function addStyles() {
  if (document.querySelector("#rsn-native-styles")) return;
  const style = document.createElement("style");
  style.id = "rsn-native-styles";
  style.textContent = `
    #rsn-native-pager { display:flex; flex-direction:column; align-items:stretch; gap:12px; width:100%; margin:10px 0 25px; padding:14px; border-radius:8px; background:#272930; color:#fff; }
    #rsn-native-pager * { box-sizing:border-box; }
    .rsn-button { min-width:42px; height:38px; padding:0 12px; border:0; border-radius:8px; background:#3b3e48; color:#fff; cursor:pointer; font-weight:700; }
    .rsn-button:hover { background:#4a4e5a; }
    .rsn-button:disabled { opacity:.45; cursor:default; }
    .rsn-label { min-width:112px; text-align:center; font-weight:700; }
    .rsn-input { width:70px; height:38px; padding:0 9px; border:1px solid #5b5e68; border-radius:8px; background:#17181c; color:#fff; }
    .rsn-status { color:#b8b8b8; font-size:12px; text-align:center; }
    .rsn-status:empty { display:none; }
    .rsn-filters,.rsn-navigation,.rsn-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px; }
    .rsn-filters { gap:8px 12px; padding-bottom:2px; }
    .rsn-navigation { padding-top:2px; }
    .rsn-actions { padding-top:2px; }
    .rsn-filter-field,.rsn-filter-check { display:flex; align-items:center; gap:6px; margin:0; color:#fff; font-size:13px; font-weight:600; }
    .rsn-filter-input { width:74px; height:32px; padding:0 8px; border:1px solid #5b5e68; border-radius:7px; background:#17181c; color:#fff; }
    .rsn-filter-check input { width:16px; height:16px; margin:0; }
    #rsn-random-server,#rsn-last-server { display:inline-grid; place-items:center; flex:0 0 auto; margin:0; padding:0; border:0; border-radius:8px; background:#335fff; color:#fff; cursor:pointer; font-size:18px; font-weight:700; line-height:1; }
    #rsn-random-server svg,#rsn-last-server svg { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; }
    #rsn-random-server:hover,#rsn-last-server:hover { filter:brightness(1.08); }
    #rsn-random-server:disabled,#rsn-last-server:disabled { cursor:not-allowed; opacity:.55; }
    #rsn-last-server.rsn-unavailable { cursor:pointer; opacity:.55; }
    #rsn-rejoin-message { position:fixed; z-index:100000; max-width:290px; padding:12px 14px; border:1px solid #4b4e58; border-radius:8px; background:#272930; color:#fff; box-shadow:0 8px 24px rgba(0,0,0,.4); font-size:13px; line-height:1.35; }
    .rsn-card-tools { display:flex; align-items:center; gap:5px; margin:6px 0; }
    .rsn-card-tool { height:24px; padding:0 7px; border:0; border-radius:6px; background:#3b3e48; color:#fff; cursor:pointer; font-size:12px; }
    .rsn-card-tool.rsn-on { color:#ffd75e; }
    .rsn-card-tool.rsn-avoided { background:#51272c; color:#ff6b72; box-shadow:inset 0 0 0 1px #784047; }
    .rsn-ping { margin-left:auto; padding:3px 7px; border-radius:999px; background:#555963; color:#fff; font-size:11px; font-weight:700; }
    .rsn-ping.good { background:#267a4b; } .rsn-ping.fair { background:#8a6a20; } .rsn-ping.poor { background:#8a3540; }
  `;
  document.head.appendChild(style);
}

function installRandomServerButton() {
  if (document.querySelector("#rsn-random-server") || !getPlaceId()) return;
  const playButton = document.querySelector(
    '[data-testid="play-button"], .game-play-button, .btn-common-play-game-lg'
  );
  if (!playButton) return;

  addStyles();
  const randomButton = document.createElement("button");
  randomButton.id = "rsn-random-server";
  randomButton.type = "button";
  randomButton.title = "Join a random low-ping server";
  randomButton.setAttribute("aria-label", "Join a random low-ping server");

  const showShuffleIcon = () => {
    randomButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h3.5c4.5 0 4.5 10 9 10H20"></path>
        <path d="m17 14 3 3-3 3"></path>
        <path d="M4 17h3.5c1.5 0 2.5-1.1 3.5-2.7"></path>
        <path d="M13 9.7C14 8.1 15 7 16.5 7H20"></path>
        <path d="m17 4 3 3-3 3"></path>
      </svg>`;
  };
  showShuffleIcon();

  const lastButton = document.createElement("button");
  lastButton.id = "rsn-last-server";
  lastButton.type = "button";
  lastButton.title = "Rejoin the last joined server";
  lastButton.setAttribute("aria-label", "Rejoin the last joined server");
  lastButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11a8 8 0 1 1 2.3 6.7"></path>
      <path d="M4 5v6h6"></path>
    </svg>`;
  const lastServerKey = `rsn-last-server-${getPlaceId()}`;
  const setLastAvailable = (available) => {
    lastButton.classList.toggle("rsn-unavailable", !available);
    lastButton.setAttribute("aria-disabled", String(!available));
  };
  const showRejoinMessage = () => {
    document.querySelector("#rsn-rejoin-message")?.remove();
    const message = document.createElement("div");
    message.id = "rsn-rejoin-message";
    message.textContent = "The main Play button won't save your previously joined server. Use Random Server or a server's Join button instead.";
    document.body.appendChild(message);
    const rect = lastButton.getBoundingClientRect();
    message.style.left = `${Math.max(10, Math.min(innerWidth - message.offsetWidth - 10, rect.left))}px`;
    message.style.top = `${Math.max(10, rect.top - message.offsetHeight - 10)}px`;
    setTimeout(() => message.remove(), 5500);
  };
  setLastAvailable(false);

  const matchPlayButtonSize = () => {
    const height = Math.round(playButton.getBoundingClientRect().height);
    if (height > 0) {
      randomButton.style.width = `${height}px`;
      randomButton.style.height = `${height}px`;
      lastButton.style.width = `${height}px`;
      lastButton.style.height = `${height}px`;
    }
  };

  const playButtonRow = playButton.parentElement;
  if (playButtonRow) {
    playButtonRow.style.setProperty("display", "flex", "important");
    playButtonRow.style.setProperty("flex-direction", "row", "important");
    playButtonRow.style.setProperty("flex-wrap", "nowrap", "important");
    playButtonRow.style.setProperty("align-items", "stretch", "important");
    playButtonRow.style.setProperty("gap", "4px", "important");
    playButtonRow.style.setProperty("width", "100%", "important");
    playButton.style.setProperty("flex", "1 1 0", "important");
    playButton.style.setProperty("width", "auto", "important");
    playButton.style.setProperty("min-width", "0", "important");
    randomButton.style.setProperty("flex", "0 0 auto", "important");
    lastButton.style.setProperty("flex", "0 0 auto", "important");
  }
  playButton.insertAdjacentElement("beforebegin", lastButton);
  playButton.insertAdjacentElement("afterend", randomButton);
  matchPlayButtonSize();
  new ResizeObserver(matchPlayButtonSize).observe(playButton);

  randomButton.addEventListener("click", async () => {
    randomButton.disabled = true;
    randomButton.textContent = "…";
    try {
      const result = await sendMessage({
        type: "GET_PUBLIC_SERVERS",
        placeId: getPlaceId(),
        cursor: null,
        limit: 100
      });
      const available = result.servers.filter((server) => server.playing < server.maxPlayers);
      if (!available.length) throw new Error("No available public servers were found.");
      const serversWithPing = available
        .filter((server) => Number.isFinite(server.ping) && server.ping > 0)
        .sort((left, right) => left.ping - right.ping);
      const rankedServers = serversWithPing.length ? serversWithPing : available;
      // Randomize within the best 20% (at least five, at most twenty) so the
      // result favors low latency without repeatedly choosing one server.
      const poolSize = Math.min(
        rankedServers.length,
        20,
        Math.max(5, Math.ceil(rankedServers.length * 0.2))
      );
      const preferredPool = rankedServers.slice(0, poolSize);
      const server = preferredPool[Math.floor(Math.random() * preferredPool.length)];
      chrome.storage.local.set({ [lastServerKey]: server.id }, () => {
        setLastAvailable(true);
      });
      window.dispatchEvent(new CustomEvent("rsn-join-game-instance", {
        detail: { placeId: getPlaceId(), serverId: server.id }
      }));
    } catch (error) {
      randomButton.title = error.message;
      console.error("Random server failed:", error);
    } finally {
      randomButton.disabled = false;
      showShuffleIcon();
    }
  });

  chrome.storage.local.get(lastServerKey, (result) => {
    setLastAvailable(Boolean(result[lastServerKey]));
  });
  lastButton.addEventListener("click", () => {
    chrome.storage.local.get(lastServerKey, (result) => {
      const serverId = result[lastServerKey];
      if (!serverId) {
        showRejoinMessage();
        return;
      }
      window.dispatchEvent(new CustomEvent("rsn-join-game-instance", {
        detail: { placeId: getPlaceId(), serverId }
      }));
    });
  });

  window.addEventListener("rsn-game-instance-launched", (event) => {
    if (String(event.detail?.placeId) !== String(getPlaceId()) || !event.detail?.serverId) return;
    chrome.storage.local.set({ [lastServerKey]: event.detail.serverId }, () => {
      setLastAvailable(true);
    });
  });

  // Fallback for native card Join buttons when Roblox uses a private launcher
  // reference that cannot be observed through the MAIN-world bridge.
  document.addEventListener("click", (event) => {
    const joinButton = event.target.closest("button,a,[role='button']");
    if (!joinButton || joinButton.textContent.trim() !== "Join") return;
    let card = joinButton.parentElement;
    for (let depth = 0; card && depth < 9; depth += 1, card = card.parentElement) {
      const textId = card.textContent.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)?.[0];
      const dataNode = card.matches?.("[data-game-instance-id],[data-server-id],[data-job-id]")
        ? card
        : card.querySelector?.("[data-game-instance-id],[data-server-id],[data-job-id]");
      const dataId = dataNode?.dataset.gameInstanceId || dataNode?.dataset.serverId || dataNode?.dataset.jobId;
      const serverId = textId || dataId;
      if (serverId) {
        chrome.storage.local.set({ [lastServerKey]: serverId }, () => {
          setLastAvailable(true);
        });
        break;
      }
    }
  }, true);
}

function waitForCards(section, count) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; observer.disconnect(); clearTimeout(timer); resolve(serverCards(section).length > count); };
    const observer = new MutationObserver(() => { if (serverCards(section).length > count) finish(); });
    observer.observe(section, { childList:true, subtree:true });
    const timer = setTimeout(finish, 7000);
  });
}

function install(section) {
  if (document.querySelector("#rsn-native-pager")) return;
  const nativeMore = loadMoreButton(section);
  if (!nativeMore) return;
  addStyles();

  const pager = document.createElement("div");
  pager.id = "rsn-native-pager";
  pager.innerHTML = `
    <div class="rsn-filters">
      <label class="rsn-filter-field">Min players <input class="rsn-filter-input" data-filter="min" type="number" min="0" step="1" placeholder="0" aria-label="Minimum players"></label>
      <label class="rsn-filter-field">Max players <input class="rsn-filter-input" data-filter="max" type="number" min="0" step="1" placeholder="Any" aria-label="Maximum players"></label>
      <button class="rsn-button" data-action="filter-search">Apply Min/Max</button>
      <button class="rsn-button" data-action="filter-reset">Reset Min/Max</button>
      <label class="rsn-filter-check"><input data-filter="favorites" type="checkbox"> Favorites only</label>
    </div>
    <div class="rsn-navigation">
      <button class="rsn-button" data-jump="first">First</button>
      <button class="rsn-button" data-jump="-100">&lt;&lt;&lt;</button>
      <button class="rsn-button" data-jump="-10">&lt;&lt;</button>
      <button class="rsn-button" data-jump="-1">&lt;</button>
      <span class="rsn-label">Page 1 of …</span>
      <button class="rsn-button" data-jump="1">&gt;</button>
      <button class="rsn-button" data-jump="10">&gt;&gt;</button>
      <button class="rsn-button" data-jump="100">&gt;&gt;&gt;</button>
      <button class="rsn-button" data-jump="last">Last</button>
    </div>
    <div class="rsn-actions">
      <span class="rsn-page-jump-control">Go to page</span>
      <input class="rsn-input rsn-page-jump-control" type="number" min="1" step="1" value="1" aria-label="Page number">
      <button class="rsn-button rsn-page-jump-control" data-action="go">Go</button>
      <button class="rsn-button" data-action="refresh">Refresh total</button>
      <button class="rsn-button" data-action="clear-avoided">Clear avoided</button>
    </div>
    <div class="rsn-status"></div>`;

  // This is deliberately outside the Roblox section. No click from this bar
  // can reach Roblox's delegated Load More container.
  section.insertAdjacentElement("afterend", pager);
  nativeMore.dataset.rsnNativeMore = "true";
  nativeMore.style.display = "none";
  applyFeatureVisibility();

  const label = pager.querySelector(".rsn-label");
  const input = pager.querySelector(".rsn-input");
  const status = pager.querySelector(".rsn-status");
  const state = { page:1, total:null, capped:false, ended:false, busy:false, largeGame:false, playerCount:0 };
  const totalKey = `rsn-native-total-${getPlaceId()}`;
  const favoriteKey = `rsn-favorites-${getPlaceId()}`;
  const avoidKey = `rsn-avoided-${getPlaceId()}`;
  const filterKey = `rsn-filters-${getPlaceId()}`;
  const favorites = new Set();
  const avoided = new Set();
  const serverInfo = new Map();
  const filters = {
    min:Math.max(0, Number(featureSettings.minPlayers) || 0),
    max:featureSettings.maxPlayers === null || featureSettings.maxPlayers === undefined || featureSettings.maxPlayers === ""
      ? null
      : Math.max(0, Number(featureSettings.maxPlayers) || 0),
    favoritesOnly:false
  };
  let resetTimer = null;

  window.addEventListener("rsn-native-server-data", (event) => {
    for (const server of event.detail?.servers || []) {
      if (!server?.id) continue;
      serverInfo.set(`${server.id.slice(0,4)}-${server.id.slice(-4)}`.toLowerCase(), server);
    }
    render();
  });
  window.dispatchEvent(new CustomEvent("rsn-request-native-server-data"));

  chrome.storage.local.get([favoriteKey, avoidKey, filterKey], (data) => {
    (data[favoriteKey] || []).forEach((id) => favorites.add(id));
    (data[avoidKey] || []).forEach((id) => avoided.add(id));
    const saved = data[filterKey] || {};
    filters.min = saved.min === undefined ? filters.min : Math.max(0, Number(saved.min) || 0);
    filters.max = saved.max === undefined
      ? filters.max
      : saved.max === null || saved.max === "" ? null : Math.max(0, Number(saved.max));
    filters.favoritesOnly = Boolean(saved.favoritesOnly);
    pager.querySelector('[data-filter="min"]').value = filters.min || "";
    pager.querySelector('[data-filter="max"]').value = filters.max ?? "";
    pager.querySelector('[data-filter="favorites"]').checked = filters.favoritesOnly;
    render();
  });

  function shortId(card) { return card.textContent.match(/\bID\s*:\s*([0-9a-f]{4}-[0-9a-f]{4})\b/i)?.[1]?.toLowerCase() || null; }
  function cardServerId(card) {
    return card.dataset.rsnServerId || card.querySelector(".rsn-card-tools")?.dataset.id || shortId(card);
  }
  function decorate() {
    const detailContainers = section.querySelectorAll(".rbx-public-game-server-details,.game-server-details");
    detailContainers.forEach((details, index) => {
      const idElement = details.querySelector(".server-id-text");
      if (!idElement) return;
      const id = shortId(details) || idElement.textContent.replace(/^\s*ID\s*:\s*/i, "").trim() || `server-${index}`;
      let tools = details.querySelector(".rsn-card-tools");
      if (!tools) {
        tools=document.createElement("div"); tools.className="rsn-card-tools";
        tools.innerHTML='<button class="rsn-card-tool" data-tool="favorite">☆</button><button class="rsn-card-tool" data-tool="avoid">⊘</button><button class="rsn-card-tool" data-tool="copy">Copy ID</button><span class="rsn-ping" hidden></span>';
        idElement.insertAdjacentElement("beforebegin", tools);
      }
      tools.dataset.id=id;
      const outerCard = details.closest(".rbx-public-game-server-item") || details.closest(".card-item-public-server");
      if (outerCard) outerCard.dataset.rsnServerId = id;
      const favorite=tools.querySelector('[data-tool="favorite"]'); favorite.textContent=favorites.has(id)?"★":"☆"; favorite.classList.toggle("rsn-on",favorites.has(id));
      const avoid=tools.querySelector('[data-tool="avoid"]'); avoid.classList.toggle("rsn-avoided",avoided.has(id)); avoid.setAttribute("aria-pressed",String(avoided.has(id))); avoid.title=avoided.has(id)?"Remove avoid mark":"Mark server to avoid";
      const info=serverInfo.get(id); const badge=tools.querySelector(".rsn-ping");
      badge.hidden=true; badge.textContent=""; badge.className="rsn-ping";
      if(info?.ping>0){badge.hidden=false;badge.textContent=`${info.ping} ms`;badge.className=`rsn-ping ${info.ping<=100?"good":info.ping<=180?"fair":"poor"}`;tools.dataset.fullId=info.id;}
    });
    applyFeatureVisibility();
  }
  function requestCardServerData() {
    window.dispatchEvent(new CustomEvent("rsn-request-native-server-data"));
  }
  function cardPlayerCount(card) {
    const countElement = card.querySelector(
      ".game-server-details .text-info, .rbx-public-game-server-details .text-info"
    );
    const countText = countElement?.textContent || card.textContent || "";
    const match = countText.match(/(\d+)\s+of\s+\d+/i);
    return match ? Number(match[1]) : -1;
  }
  function cardMaxPlayers(card) {
    const countElement = card.querySelector(
      ".game-server-details .text-info, .rbx-public-game-server-details .text-info"
    );
    const countText = countElement?.textContent || card.textContent || "";
    const match = countText.match(/\d+\s+of\s+(\d+)/i);
    return match ? Number(match[1]) : -1;
  }
  function loadedServerCapacity() {
    return Math.max(-1, ...serverCards(section).map(cardMaxPlayers));
  }
  function visibleCards() {
    return serverCards(section).filter((card) => {
      const id = cardServerId(card);
      const players = cardPlayerCount(card);
      if (featureSettings.favorites && filters.favoritesOnly && !favorites.has(id)) return false;
      if (featureSettings.playerFilters && players < 0 && (filters.min > 0 || filters.max !== null)) return false;
      if (featureSettings.playerFilters && players >= 0 && players < filters.min) return false;
      if (featureSettings.playerFilters && filters.max !== null && players > filters.max) return false;
      return true;
    });
  }

  function loadedPages() { return Math.max(1, Math.ceil(visibleCards().length / PAGE_SIZE)); }
  function hasMore() {
    const button = loadMoreButton(section);
    return Boolean(button && button.getAttribute("aria-disabled") !== "true");
  }
  function excludesFullServers() {
    const checkbox = [...section.querySelectorAll('input[type="checkbox"]')].find((input) =>
      /exclude full servers/i.test(input.closest("label")?.textContent || input.parentElement?.textContent || "")
    );
    return checkbox ? checkbox.checked : true;
  }
  function render() {
    const cards = serverCards(section);
    decorate();
    const capacity = loadedServerCapacity();
    if (capacity >= 0) {
      pager.querySelector('[data-filter="min"]').max = capacity;
      pager.querySelector('[data-filter="max"]').max = capacity;
    }
    const usable = visibleCards();
    const start = (state.page - 1) * PAGE_SIZE;
    cards.forEach((card) => {
      card.style.display="none";
      card.style.minHeight="";
    });
    const pageCards = usable.slice(start,start+PAGE_SIZE);
    pageCards.forEach((card) => card.style.display="");
    const tallestCard = Math.max(0, ...pageCards.map((card) => card.getBoundingClientRect().height));
    pageCards.forEach((card) => { card.style.minHeight = `${Math.ceil(tallestCard)}px`; });
    const totalText = state.capped ? `${Math.max(TOTAL_BLOCK, Math.ceil(state.page/TOTAL_BLOCK)*TOTAL_BLOCK)}+` : state.total ?? "…";
    label.textContent = `Page ${state.page} of ${totalText}`;
    input.value = state.page;
    [...pager.querySelectorAll("button")].forEach((button) => button.disabled = state.busy);
    const safetyMessage = state.largeGame
      ? `Disabled because this game has ${state.playerCount.toLocaleString()} active players.`
      : "";
    for (const button of [pager.querySelector('[data-jump="last"]'), pager.querySelector('[data-action="refresh"]')]) {
      button.disabled = state.busy || state.largeGame;
      button.title = safetyMessage;
    }
  }
  window.addEventListener("rsn-feature-settings-changed", () => {
    filters.min = Math.max(0, Number(featureSettings.minPlayers) || 0);
    filters.max = featureSettings.maxPlayers === null || featureSettings.maxPlayers === undefined || featureSettings.maxPlayers === ""
      ? null
      : Math.max(filters.min, Number(featureSettings.maxPlayers) || 0);
    pager.querySelector('[data-filter="min"]').value = filters.min || "";
    pager.querySelector('[data-filter="max"]').value = filters.max ?? "";
    state.page = 1;
    chrome.storage.local.set({ [filterKey]:filters });
    render();
  });
  async function loadBatch() {
    const button = loadMoreButton(section);
    if (!button) { state.ended = true; return false; }
    const count = serverCards(section).length;
    button.click();
    const added = await waitForCards(section, count);
    const currentButton = loadMoreButton(section);
    if (currentButton) currentButton.style.display = "none";
    if (!added && !currentButton) state.ended = true;
    requestCardServerData();
    render();
    return added;
  }
  async function go(targetValue) {
    const target = Math.max(1, Math.floor(Number(targetValue) || 1));
    // Keep the current complete page visible as a ghost batch while Roblox
    // appends enough hidden cards for the destination. This preserves the
    // server grid's height and prevents the page from jumping while loading.
    state.busy = true; status.textContent = `Loading page ${target}…`; render();
    // Roblox commonly appends eight cards at a time. Do not consider a page
    // ready until all eight positions exist.
    while (visibleCards().length < target * PAGE_SIZE && hasMore()) {
      if (!(await loadBatch())) break;
      status.textContent = `Loading page ${target}… (${loadedPages()} ready)`;
    }
    state.page = Math.min(target, loadedPages());
    if (!hasMore()) { state.ended=true; state.total=loadedPages(); state.capped=false; }
    status.textContent = state.page < target ? `The last available page is ${state.page}.` : "";
    state.busy=false; render();
  }
  async function total(force=false, exact=false) {
    if (state.largeGame) return;
    if (!force) {
      const cached = await new Promise((resolve) => chrome.storage.local.get(totalKey, (data) => resolve(data[totalKey])));
      if (cached) { state.total=cached.pages; state.capped=cached.capped; render(); return; }
    }
    status.textContent = exact ? "Finding last page…" : "Counting pages…";
    try {
      const result = await sendMessage({
        type:"GET_SERVER_TOTAL",
        placeId:getPlaceId(),
        unlimited:exact,
        pageSize:PAGE_SIZE,
        excludeFullGames:excludesFullServers()
      });
      state.total=result.pages; state.capped=result.capped;
      chrome.storage.local.set({[totalKey]:result}); render();
      if (exact) await go(result.pages); else status.textContent="";
    } catch(error) { status.textContent=error.message; }
  }

  async function checkGameSize() {
    try {
      const result = await sendMessage({ type:"GET_GAME_PLAYER_COUNT", placeId:getPlaceId() });
      state.playerCount = result.playing;
      state.largeGame = result.playing >= LARGE_GAME_PLAYER_THRESHOLD;
      if (state.largeGame) {
        state.total = TOTAL_BLOCK;
        state.capped = true;
        status.textContent = `Last and Refresh total button disabled for larger games (${result.playing.toLocaleString()} active players).`;
      }
      render();
      return state.largeGame;
    } catch (error) {
      console.warn("Could not check active player count:", error);
      return false;
    }
  }

  pager.addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.jump === "first") go(1);
    else if (button.dataset.jump === "last") total(true,true);
    else if (button.dataset.jump) go(state.page + Number(button.dataset.jump));
    else if (button.dataset.action === "go") go(input.value);
    else if (button.dataset.action === "refresh") chrome.storage.local.remove(totalKey, () => total(true,false));
    else if (button.dataset.action === "clear-avoided") { avoided.clear(); chrome.storage.local.set({[avoidKey]:[]}); render(); }
    else if (button.dataset.action === "filter-search") applyFilters();
    else if (button.dataset.action === "filter-reset") resetMinMax();
  });
  section.addEventListener("click", async (event) => {
    const tool=event.target.closest("[data-tool]"); if(!tool)return;
    event.preventDefault();event.stopPropagation();
    const row=tool.closest(".rsn-card-tools");const id=row?.dataset.id;if(!id)return;
    if(tool.dataset.tool==="favorite"){favorites.has(id)?favorites.delete(id):favorites.add(id);chrome.storage.local.set({[favoriteKey]:[...favorites]});render();}
    if(tool.dataset.tool==="avoid"){avoided.has(id)?avoided.delete(id):avoided.add(id);chrome.storage.local.set({[avoidKey]:[...avoided]});render();}
    if(tool.dataset.tool==="copy"){try{await navigator.clipboard.writeText(row.dataset.fullId||id);status.textContent="Server ID copied.";}catch{status.textContent="Could not copy server ID.";}}
  },true);

  // Roblox replaces each card's inner contents after thumbnails and server
  // details resolve. Reapply the utility row whenever that native DOM changes.
  let decorateQueued = false;
  new MutationObserver(() => {
    if (decorateQueued) return;
    decorateQueued = true;
    requestAnimationFrame(() => {
      decorateQueued = false;
      decorate();
    });
  }).observe(section, { childList:true, subtree:true });
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") go(input.value); });
  function applyFilters() {
    const minValue = pager.querySelector('[data-filter="min"]').value;
    const maxValue = pager.querySelector('[data-filter="max"]').value;
    const capacity = loadedServerCapacity();
    const clamp = (value) => capacity >= 0 ? Math.min(capacity, value) : value;
    const nextMin = clamp(Math.max(0, Number(minValue) || 0));
    const nextMax = maxValue === "" ? null : clamp(Math.max(0, Number(maxValue)));
    pager.querySelector('[data-filter="min"]').value = minValue === "" ? "" : nextMin;
    pager.querySelector('[data-filter="max"]').value = maxValue === "" ? "" : nextMax;
    if (nextMax !== null && nextMin > nextMax) {
      status.textContent = "Minimum players cannot be higher than maximum players.";
      return;
    }
    filters.min = nextMin;
    filters.max = nextMax;
    filters.favoritesOnly = pager.querySelector('[data-filter="favorites"]').checked;
    chrome.storage.local.set({ [filterKey]:filters });
    state.page = 1;
    render();
    const matching = visibleCards().length;
    status.textContent = minValue === "" && maxValue === ""
      ? `Player filters cleared. ${matching} loaded servers available.`
      : `${matching} loaded servers match the Min/Max filter.`;
  }
  function resetMinMax() {
    pager.querySelector('[data-filter="min"]').value = "";
    pager.querySelector('[data-filter="max"]').value = "";
    filters.min = 0;
    filters.max = null;
    filters.favoritesOnly = pager.querySelector('[data-filter="favorites"]').checked;
    chrome.storage.local.set({ [filterKey]:filters });
    state.page = 1;
    render();
    status.textContent = `Min/Max cleared. ${visibleCards().length} loaded servers available.`;
  }
  pager.querySelector('[data-filter="favorites"]').addEventListener("change", applyFilters);
  for (const field of pager.querySelectorAll(".rsn-filter-input")) {
    field.addEventListener("keydown", (event) => { if (event.key === "Enter") applyFilters(); });
  }

  function resetAfterNativeControl() {
    clearTimeout(resetTimer);
    state.page=1; state.total=null; state.capped=false; state.ended=false; state.busy=false;
    status.textContent="Refreshing servers…";
    chrome.storage.local.remove(totalKey);
    render();
    resetTimer=setTimeout(() => {
      const button=loadMoreButton(section); if(button) button.style.display="none";
      status.textContent=""; render(); total(true,false);
    }, 700);
  }

  section.addEventListener("change", (event) => {
    if (event.target.matches('select,input[type="checkbox"]')) resetAfterNativeControl();
  });
  document.addEventListener("click", (event) => {
    if (pager.contains(event.target)) return;
    const text=event.target.closest("button,[role='button'],[role='option']")?.textContent.trim();
    if (text === "Refresh" || ["Recommended For You","Best Connection (Ping)","Most Players","Fewest Players"].includes(text)) {
      resetAfterNativeControl();
    }
  }, true);

  go(1).then(async () => {
    sendMessage({type:"GET_PUBLIC_SERVERS",placeId:getPlaceId(),cursor:null,limit:100}).then((result)=>{
      result.servers.forEach((server)=>serverInfo.set(`${server.id.slice(0,4)}-${server.id.slice(-4)}`.toLowerCase(),server));render();
    }).catch(()=>{});
    if (!(await checkGameSize())) total(false,false);
  });
}

function initialize() {
  installRandomServerButton();
  const section = findSection();
  if (section) install(section);
}
initialize();
new MutationObserver(initialize).observe(document.body, {childList:true, subtree:true});
