console.log("Roblox Server Navigator native integration loaded!");

const PAGE_SIZE = 8;
const TOTAL_BLOCK = 100;
const LARGE_GAME_PLAYER_THRESHOLD = 25000;
const FEATURE_SETTINGS_KEY = "rsn-feature-settings";
const CURRENT_CAPACITY_KEY = "rsn-current-server-capacity";
const DEFAULT_FEATURE_SETTINGS = {
  randomServer:true,
  rejoinServer:true,
  pagination:true,
  serverIdSearch:true,
  playerFilters:true,
  minPlayers:0,
  maxPlayers:null,
  totalControls:true,
  favorites:true,
  avoid:true,
  copyId:true
};
const featureSettings = { ...DEFAULT_FEATURE_SETTINGS };

function markRobloxPageActive() {
  chrome.runtime.sendMessage({ type:"ROBLOX_PAGE_ACTIVE" }, () => void chrome.runtime.lastError);
}

function setFeatureVisible(element, visible) {
  if (element) element.style.setProperty("display", visible ? "" : "none", "important");
}

function applyFeatureVisibility() {
  document.documentElement.classList.toggle("rsn-api-pagination-on",featureSettings.pagination);
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
  setFeatureVisible(document.querySelector(".rsn-api-grid"), featureSettings.pagination);
  setFeatureVisible(document.querySelector(".rsn-server-search"), featureSettings.serverIdSearch);
  const favoritesInput = document.querySelector('[data-filter="favorites"]');
  const favoritesControl = favoritesInput?.closest(".rsn-toolbar-favorites") || favoritesInput?.closest("label");
  const favoritesInsidePager = Boolean(favoritesControl?.closest("#rsn-native-pager"));
  const filterBar = document.querySelector(".rsn-native-filter-row, #rsn-native-pager .rsn-filters");
  setFeatureVisible(filterBar, featureSettings.playerFilters || (favoritesInsidePager && featureSettings.favorites));
  document.querySelectorAll('[data-filter="min"],[data-filter="max"],[data-action="filter-search"],[data-action="filter-reset"]').forEach((element) =>
    setFeatureVisible(element.closest("label") || element, featureSettings.playerFilters)
  );
  setFeatureVisible(favoritesControl, featureSettings.favorites);
  setFeatureVisible(document.querySelector('#rsn-native-pager [data-jump="last"]'), featureSettings.totalControls && featureSettings.pagination);
  setFeatureVisible(document.querySelector('#rsn-native-pager [data-action="refresh"]'), featureSettings.totalControls);
  setFeatureVisible(document.querySelector("#rsn-native-pager .rsn-total-status"), featureSettings.totalControls);
  setFeatureVisible(document.querySelector('#rsn-native-pager [data-action="clear-avoided"]'), featureSettings.avoid);
  document.querySelectorAll('[data-tool="favorite"]').forEach((element) => setFeatureVisible(element, featureSettings.favorites));
  document.querySelectorAll('[data-tool="avoid"]').forEach((element) => setFeatureVisible(element, featureSettings.avoid));
  document.querySelectorAll('[data-tool="copy"],[data-tool="copy-link"]').forEach((element) => setFeatureVisible(element, featureSettings.copyId));
  document.querySelectorAll(".rsn-card-tools").forEach((row) => {
    const hasVisibleButton = [...row.querySelectorAll("button")].some((button) => button.style.display !== "none");
    setFeatureVisible(row, hasVisibleButton);
  });
}

chrome.storage.local.get(FEATURE_SETTINGS_KEY, (result) => {
  Object.assign(featureSettings, result[FEATURE_SETTINGS_KEY] || {});
  applyFeatureVisibility();
  markRobloxPageActive();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[FEATURE_SETTINGS_KEY]) return;
  Object.assign(featureSettings, DEFAULT_FEATURE_SETTINGS, changes[FEATURE_SETTINGS_KEY].newValue || {});
  applyFeatureVisibility();
  markRobloxPageActive();
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

function compactServerId(serverId) {
  const id = String(serverId || "").trim().toLowerCase();
  return id.length > 8 ? `${id.slice(0,4)}-${id.slice(-4)}` : id;
}

function readAvoidedServers(placeId = getPlaceId()) {
  const key = `rsn-avoided-${placeId}`;
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (data) => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      resolve(new Set((Array.isArray(data[key]) ? data[key] : []).map((id) => String(id).trim().toLowerCase())));
    });
  });
}

function serverIsAvoided(avoided, serverId) {
  const id = String(serverId || "").trim().toLowerCase();
  return avoided.has(id) || avoided.has(compactServerId(id));
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
  const apiGrid = section.querySelector(".rsn-api-grid");
  if (apiGrid) return [...apiGrid.querySelectorAll(".rsn-api-card")];
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
    :root {
      --rsn-surface:var(--color-surface-200,var(--color-background-2,#272930));
      --rsn-input:var(--color-surface-100,var(--color-background-1,#17181c));
      --rsn-button:var(--color-action-standard-background,var(--color-surface-300,#3b3e48));
      --rsn-button-hover:var(--color-action-standard-background-hover,var(--color-surface-400,#4a4e5a));
      --rsn-text:var(--color-content-emphasis,var(--color-text-primary,#fff));
      --rsn-muted:var(--color-content-default,var(--color-text-secondary,#b8b8b8));
      --rsn-border:var(--color-stroke-default,var(--color-border-primary,#5b5e68));
      --rsn-accent:var(--color-action-emphasis-background,var(--color-action-primary-background,#335fff));
      --rsn-accent-text:var(--color-action-emphasis-content,var(--color-action-primary-content,#fff));
      --rsn-page-theme:var(--rsn-surface);
    }
    :root.rsn-light-page {
      --rsn-surface:#f7f7f8;
      --rsn-input:#fff;
      --rsn-button:#e3e4e8;
      --rsn-button-hover:#d7d9de;
      --rsn-text:#191b20;
      --rsn-muted:#565b66;
      --rsn-border:#c7cad1;
      --rsn-accent:#335fff;
      --rsn-accent-text:#fff;
    }
    :root #rsn-native-pager {
      background:var(--rsn-surface)!important;
    }
    :root .rsn-native-filter-row .rsn-filter-input,
    :root .rsn-server-search-input,
    :root #rsn-native-pager .rsn-input {
      background:color-mix(in srgb,var(--rsn-page-theme) 72%,var(--rsn-button))!important;
    }
    :root.rsn-light-page .rsn-native-filter-row .rsn-filter-input,
    :root.rsn-light-page .rsn-server-search-input,
    :root.rsn-light-page #rsn-native-pager .rsn-input,
    :root.rsn-light-page .rsn-native-sort-row .select-group select,
    :root.rsn-light-page .rsn-native-sort-row .select-group [role="combobox"],
    :root.rsn-light-page .rsn-native-sort-row .select-group button {
      background:var(--rsn-button)!important;
    }
    :root.rsn-light-page .rsn-button,
    :root.rsn-light-page .rsn-card-tool {
      background:color-mix(in srgb,var(--rsn-page-theme) 72%,var(--rsn-button))!important;
    }
    #rsn-native-pager { display:flex; flex-direction:column; align-items:stretch; gap:12px; width:100%; margin:10px 0 25px; padding:14px; border:1px solid var(--rsn-border); border-radius:8px; background:var(--rsn-surface); color:var(--rsn-text); }
    #rsn-native-pager * { box-sizing:border-box; }
    .rsn-button { min-width:42px; height:38px; padding:0 12px; border:1px solid var(--rsn-border); border-radius:8px; background:var(--rsn-button); color:var(--rsn-text); cursor:pointer; font-weight:700; }
    .rsn-button:hover { background:var(--rsn-button-hover); }
    .rsn-button:disabled { opacity:.45; cursor:default; }
    .rsn-label { min-width:112px; text-align:center; font-weight:700; }
    .rsn-input { width:70px; height:38px; padding:0 9px; border:1px solid var(--rsn-border); border-radius:8px; background:var(--rsn-input); color:var(--rsn-text); }
    .rsn-status { color:var(--rsn-muted); font-size:12px; text-align:center; }
    .rsn-status:empty { display:none; }
    .rsn-total-status { color:var(--rsn-muted); font-size:12px; text-align:center; }
    .rsn-total-status:empty { display:none!important; }
    .rsn-filters,.rsn-navigation,.rsn-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px; }
    .rsn-filters { gap:8px 12px; padding-bottom:2px; }
    .rsn-native-filter-row { justify-content:flex-start!important; width:100%!important; margin-top:8px!important; padding:0!important; }
    .rsn-native-filter-row .rsn-filter-field { flex:1 1 0; min-width:190px; white-space:nowrap; color:var(--rsn-muted)!important; font-family:"Builder Sans","Helvetica Neue",Arial,sans-serif!important; font-size:16px!important; font-weight:400!important; line-height:1.4!important; }
    .rsn-native-filter-row .rsn-filter-input { flex:1 1 auto; width:auto; min-width:0; max-width:210px; color:inherit; font-family:"Builder Sans","Helvetica Neue",Arial,sans-serif; font-size:16px; }
    .rsn-filter-separator { flex:0 0 auto; color:var(--rsn-muted); font-size:14px; font-weight:600; }
    .rsn-native-filter-row [data-action="filter-search"] { margin-left:0; }
    .rsn-native-filter-row .rsn-button { flex:0 0 164px; white-space:nowrap; font-weight:400; }
    .rsn-navigation { padding-top:2px; }
    .rsn-actions { padding-top:2px; }
    .rsn-filter-field,.rsn-filter-check { display:flex; align-items:center; gap:6px; margin:0; color:var(--rsn-text); font-size:13px; font-weight:600; }
    .rsn-filter-input { width:74px; height:32px; padding:0 8px; border:1px solid var(--rsn-border); border-radius:7px; background:var(--rsn-input); color:var(--rsn-text); }
    .rsn-filter-check input { width:16px; height:16px; margin:0; }
    .rsn-server-search { display:flex; flex:0 0 340px; flex-wrap:nowrap; align-items:center; align-self:center; justify-content:flex-end; gap:8px; margin-left:auto; }
    .rsn-server-search-input { flex:1 1 125px; min-width:120px; height:36px; padding:0 10px; border:1px solid var(--rsn-border); border-radius:7px; background:var(--rsn-input); color:var(--rsn-text); }
    .rsn-server-search .rsn-button { flex:0 0 auto; padding:0 10px; white-space:nowrap; font-weight:400; }
    .rsn-toolbar-favorites { flex:0 0 auto; margin-right:auto!important; margin-left:auto!important; white-space:nowrap; }
    .rsn-exclude-full { transform:translateX(-8px); }
    .rsn-server-search-input:focus { border-color:#7d8491; outline:2px solid rgba(125,132,145,.25); outline-offset:1px; }
    .rsn-search-match { outline:2px solid #62c98b!important; outline-offset:3px; }
    .rsn-native-sort-row { display:flex!important; flex-wrap:nowrap!important; align-items:center!important; width:100%!important; gap:8px!important; }
    .rsn-native-sort-row .select-group select,
    .rsn-native-sort-row .select-group [role="combobox"],
    .rsn-native-sort-row .select-group button {
      background-color:var(--rsn-button)!important;
      color:var(--rsn-text)!important;
      border-color:var(--rsn-border)!important;
    }
    [data-rsn-server-id] { clear:none!important; }
    .rsn-ghost-player-slot { visibility:hidden!important; pointer-events:none!important; }
    .rsn-more-player-slot,.rsn-more-player-label { background-color:color-mix(in srgb,var(--rsn-page-theme) 58%,var(--rsn-button))!important; color:var(--rsn-text)!important; }
    #rsn-random-server,#rsn-last-server { display:inline-grid; place-items:center; flex:0 0 auto; margin:0; padding:0; border:0; border-radius:8px; background:var(--rsn-accent); color:var(--rsn-accent-text); cursor:pointer; font-size:18px; font-weight:700; line-height:1; }
    #rsn-random-server svg,#rsn-last-server svg { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; }
    #rsn-random-server:hover,#rsn-last-server:hover { filter:brightness(1.08); }
    #rsn-random-server:disabled,#rsn-last-server:disabled { cursor:not-allowed; opacity:.55; }
    #rsn-last-server.rsn-unavailable { cursor:pointer; opacity:.55; }
    #rsn-rejoin-message { position:fixed; z-index:100000; max-width:290px; padding:12px 14px; border:1px solid var(--rsn-border); border-radius:8px; background:var(--rsn-surface); color:var(--rsn-text); box-shadow:0 8px 24px rgba(0,0,0,.28); font-size:13px; line-height:1.35; }
    .rsn-card-tools { display:flex; align-items:center; gap:5px; margin:6px 0; }
    .rsn-card-tool { height:24px; padding:0 7px; border:1px solid var(--rsn-border); border-radius:6px; background:var(--rsn-button); color:var(--rsn-text); cursor:pointer; font-size:12px; }
    .rsn-card-tool[data-tool="copy"],.rsn-card-tool[data-tool="copy-link"] { padding:0 5px; font-size:10px; white-space:nowrap; }
    .rsn-card-tool.rsn-on { color:#ffd75e; }
    .rsn-card-tool.rsn-avoided { background:#51272c; color:#ff6b72; box-shadow:inset 0 0 0 1px #784047; }
    .rsn-card-tool.rsn-copied { background:#24543a; color:#83e3a9; box-shadow:inset 0 0 0 1px #347452; }
    .rsn-api-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:18px; width:100%; margin-top:16px; }
    .rsn-api-card { display:flex; min-width:0; min-height:270px; flex-direction:column; padding:14px; background:var(--rsn-surface); color:var(--rsn-text); }
    .rsn-api-avatars { display:grid; grid-template-columns:repeat(3,52px); grid-auto-rows:52px; gap:8px; min-height:112px; margin-bottom:10px; }
    .rsn-api-avatar-slot { display:grid; width:52px; height:52px; place-items:center; overflow:hidden; border-radius:50%; background:color-mix(in srgb,var(--rsn-page-theme) 58%,var(--rsn-button)); color:var(--rsn-text); font-size:16px; font-weight:700; }
    .rsn-api-avatar-slot img { display:block; width:100%; height:100%; object-fit:cover; }
    .rsn-api-avatar-slot.rsn-api-avatar-ghost { visibility:hidden; }
    .rsn-api-player-count { margin-bottom:7px; font-size:16px; }
    .rsn-api-progress { height:6px; margin-bottom:12px; overflow:hidden; border:1px solid var(--rsn-border); border-radius:999px; background:var(--rsn-input); }
    .rsn-api-progress > span { display:block; height:100%; background:var(--rsn-muted); }
    .rsn-api-join { width:100%; height:30px; margin-top:auto; border:0; border-radius:7px; background:var(--rsn-button); color:var(--rsn-text); cursor:pointer; font-weight:700; }
    .rsn-api-join:hover { background:var(--rsn-button-hover); }
    .rsn-api-join:disabled { cursor:not-allowed; opacity:.5; }
    .rsn-api-id { color:var(--rsn-muted); font-size:11px; font-weight:600; }
    :root.rsn-api-pagination-on .rsn-api-mode .rbx-public-game-server-item,
    :root.rsn-api-pagination-on .rsn-api-mode .rbx-game-server-item,
    :root.rsn-api-pagination-on .rsn-api-mode .card-item-public-server,
    :root.rsn-api-pagination-on .rsn-api-mode [data-testid="game-server-item"] { display:none!important; }
    @media (max-width:900px) { .rsn-api-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  `;
  document.head.appendChild(style);

  const syncPageTheme = () => {
    const parseColor = (value) => value.match(/[\d.]+/g)?.map(Number) || [];
    const luminance = (channels) => channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    const usableColor = (value) => {
      const channels = parseColor(value);
      return channels.length >= 3 && (channels.length < 4 || channels[3] > 0) ? value : "";
    };
    const backgrounds = [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.documentElement).backgroundColor];
    const opaqueBackgroundValue = backgrounds.find((value) => usableColor(value));
    const opaqueBackground = opaqueBackgroundValue ? parseColor(opaqueBackgroundValue) : null;
    const textColor = parseColor(getComputedStyle(document.body).color);
    const lightPage = opaqueBackground
      ? luminance(opaqueBackground) > 160
      : textColor.length >= 3 && luminance(textColor) < 128;
    document.documentElement.classList.toggle("rsn-light-page", lightPage);

    const rootStyle = document.documentElement.style;
    const nativeCard = [...document.querySelectorAll(".rbx-public-game-server-item,.rbx-game-server-item,.card-item-public-server,[data-testid='game-server-item']")].find((card) => {
      const rect = card.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !card.closest(".rsn-api-grid");
    }) || null;
    const nativeJoin = nativeCard && exactText(nativeCard, "button,a,[role='button']", "Join")[0];
    const nativeSortControl = document.querySelector(".rsn-native-sort-row .select-group select,.rsn-native-sort-row .select-group [role='combobox'],.rsn-native-sort-row .select-group button");
    const nativeDetails = nativeCard?.querySelector(".rbx-public-game-server-details,.game-server-details");
    const cardStyles = nativeCard && getComputedStyle(nativeCard);
    const joinStyles = nativeJoin && getComputedStyle(nativeJoin);
    const sortStyles = nativeSortControl && getComputedStyle(nativeSortControl);
    const detailStyles = nativeDetails && getComputedStyle(nativeDetails);
    const pageChannels = opaqueBackground || [255,255,255];
    const cardRect = nativeCard?.getBoundingClientRect();
    const cardSurfaceCandidates = nativeCard && cardRect
      ? [nativeCard, ...nativeCard.querySelectorAll("*")].map((element) => {
          const rect = element.getBoundingClientRect();
          const background = usableColor(getComputedStyle(element).backgroundColor);
          const channels = background ? parseColor(background) : [];
          const fillsCard = rect.width >= cardRect.width * .72 && rect.height >= cardRect.height * .55;
          const distance = channels.length >= 3
            ? Math.abs(channels[0]-pageChannels[0]) + Math.abs(channels[1]-pageChannels[1]) + Math.abs(channels[2]-pageChannels[2])
            : -1;
          return { background, fillsCard, distance, area:rect.width * rect.height };
        }).filter((candidate) => candidate.background && candidate.fillsCard).sort((left,right) => right.area-left.area || right.distance-left.distance)
      : [];
    const cardThemeBackground = usableColor(cardStyles?.backgroundColor || "") || cardSurfaceCandidates[0]?.background;
    const themeColors = {
      "--rsn-surface":cardThemeBackground,
      "--rsn-input":usableColor(sortStyles?.backgroundColor || ""),
      "--rsn-button":usableColor(joinStyles?.backgroundColor || ""),
      "--rsn-button-hover":usableColor(joinStyles?.backgroundColor || ""),
      "--rsn-text":usableColor(detailStyles?.color || getComputedStyle(document.body).color),
      "--rsn-muted":usableColor(getComputedStyle(document.body).color),
      "--rsn-border":usableColor(sortStyles?.borderColor || ""),
      "--rsn-page-theme":cardThemeBackground || opaqueBackgroundValue || ""
    };
    Object.entries(themeColors).forEach(([name,value]) => {
      if (value) rootStyle.setProperty(name,value);
    });
  };
  window.__rsnSyncPageTheme = syncPageTheme;
  syncPageTheme();
  const themeObserver = new MutationObserver(syncPageTheme);
  themeObserver.observe(document.documentElement, { attributes:true, attributeFilter:["class","data-theme"] });
  if (document.body) themeObserver.observe(document.body, { attributes:true, attributeFilter:["class","data-theme"] });
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
  randomButton.title = "Join a random available server";
  randomButton.setAttribute("aria-label", "Join a random available server");

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
  const showRejoinMessage = (text = "The main Play button won't save your previously joined server. Use Random Server or a server's Join button instead.") => {
    document.querySelector("#rsn-rejoin-message")?.remove();
    const message = document.createElement("div");
    message.id = "rsn-rejoin-message";
    message.textContent = text;
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
      const avoided = await readAvoidedServers();
      const available = result.servers.filter((server) =>
        server.playing < server.maxPlayers && !serverIsAvoided(avoided, server.id)
      );
      if (!available.length) throw new Error("No non-avoided public servers were found.");
      const server = available[Math.floor(Math.random() * available.length)];
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
    chrome.storage.local.get(lastServerKey, async (result) => {
      const serverId = result[lastServerKey];
      if (!serverId) {
        showRejoinMessage();
        return;
      }
      try {
        const avoided = await readAvoidedServers();
        if (serverIsAvoided(avoided, serverId)) {
          lastButton.title = "This server is on your Avoid list";
          showRejoinMessage("This server is on your Avoid list. Remove its Avoid mark before rejoining.");
          return;
        }
      } catch (error) {
        lastButton.title = `Could not check Avoid list: ${error.message}`;
        showRejoinMessage("Could not check your Avoid list. Please try again.");
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

function install(section) {
  if (document.querySelector("#rsn-native-pager")) return;
  const nativeMore = loadMoreButton(section);
  if (!nativeMore) return;
  addStyles();

  const pager = document.createElement("div");
  pager.id = "rsn-native-pager";
  pager.innerHTML = `
    <div class="rsn-server-search">
      <input class="rsn-server-search-input" data-search-server-id type="search" placeholder="Join by server ID" aria-label="Server ID">
      <button class="rsn-button" data-action="server-id-join">Join ID</button>
    </div>
    <div class="rsn-filters">
      <label class="rsn-filter-field">Min players <input class="rsn-filter-input" data-filter="min" type="number" min="0" step="1" placeholder="0" aria-label="Minimum players"></label>
      <span class="rsn-filter-separator" aria-hidden="true">to</span>
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
    <div class="rsn-status"></div>
    <div class="rsn-total-status"></div>`;
  const serverSearch = pager.querySelector(".rsn-server-search");
  const filterBar = pager.querySelector(".rsn-filters");
  const minFilterInput = filterBar.querySelector('[data-filter="min"]');
  const maxFilterInput = filterBar.querySelector('[data-filter="max"]');
  const favoritesInput = pager.querySelector('[data-filter="favorites"]');
  const favoritesLabel = favoritesInput.closest("label");

  // This is deliberately outside the Roblox section. No click from this bar
  // can reach Roblox's delegated Load More container.
  section.insertAdjacentElement("afterend", pager);
  const excludeFullLabel = [...section.querySelectorAll("label")].find((element) =>
    /exclude full servers/i.test(element.textContent || "")
  );
  const excludeFullControl = excludeFullLabel?.closest(".checkbox") || excludeFullLabel?.parentElement;
  excludeFullControl?.classList.add("rsn-exclude-full");
  let sortRow = excludeFullLabel?.parentElement;
  for (let depth = 0; sortRow && sortRow !== section && depth < 5; depth += 1, sortRow = sortRow.parentElement) {
    if (/sort by/i.test(sortRow.textContent || "") && /exclude full servers/i.test(sortRow.textContent || "")) break;
  }
  if (sortRow && sortRow !== section) {
    sortRow.classList.add("rsn-native-sort-row");
    const favoritesToolbarControl = document.createElement("div");
    favoritesToolbarControl.className = "checkbox rsn-toolbar-favorites";
    favoritesInput.id = "rsn-favorites-only";
    const favoritesToolbarLabel = document.createElement("label");
    favoritesToolbarLabel.className = "checkbox-label text-label";
    favoritesToolbarLabel.htmlFor = favoritesInput.id;
    favoritesToolbarLabel.textContent = "Favorites only";
    favoritesLabel.replaceWith(favoritesToolbarControl);
    favoritesToolbarControl.append(favoritesInput, favoritesToolbarLabel);
    sortRow.appendChild(favoritesToolbarControl);
    sortRow.appendChild(serverSearch);
    filterBar.classList.add("rsn-native-filter-row");
    sortRow.insertAdjacentElement("afterend", filterBar);
  }
  section.classList.add("rsn-api-mode");
  const apiGrid = document.createElement("div");
  apiGrid.className = "rsn-api-grid";
  nativeMore.insertAdjacentElement("beforebegin", apiGrid);
  nativeMore.dataset.rsnNativeMore = "true";
  nativeMore.style.display = "none";
  applyFeatureVisibility();

  const label = pager.querySelector(".rsn-label");
  const input = pager.querySelector(".rsn-input");
  const status = pager.querySelector(".rsn-status");
  const totalStatus = pager.querySelector(".rsn-total-status");
  let statusClearTimer = null;
  new MutationObserver(() => {
    clearTimeout(statusClearTimer);
    const message = status.textContent.trim();
    if (!message || /^(loading|counting|finding|refreshing|searching)\b/i.test(message)) return;
    statusClearTimer = setTimeout(() => {
      status.textContent = "";
    }, 2500);
  }).observe(status, { childList:true, characterData:true, subtree:true });
  const serverSearchInput = serverSearch.querySelector("[data-search-server-id]");
  const serverIdJoinButton = serverSearch.querySelector('[data-action="server-id-join"]');
  const state = { page:1, total:null, capped:false, ended:false, busy:false, largeGame:false, playerCount:0, nextCursor:null, requestVersion:0 };
  const totalKey = `rsn-native-total-${getPlaceId()}`;
  const favoriteKey = `rsn-favorites-${getPlaceId()}`;
  const avoidKey = `rsn-avoided-${getPlaceId()}`;
  const filterKey = `rsn-filters-${getPlaceId()}`;
  const favorites = new Set();
  const avoided = new Set();
  const serverInfo = new Map();
  const apiServers = [];
  const thumbnailCache = new Map();
  const thumbnailRequests = new Set();
  const copyResetTimers = new WeakMap();
  const filters = {
    min:Math.max(0, Number(featureSettings.minPlayers) || 0),
    max:featureSettings.maxPlayers === null || featureSettings.maxPlayers === undefined || featureSettings.maxPlayers === ""
      ? null
      : Math.max(0, Number(featureSettings.maxPlayers) || 0),
    favoritesOnly:false
  };
  let resetTimer = null;
  let publishedCapacity = null;

  window.addEventListener("rsn-native-server-data", (event) => {
    for (const server of event.detail?.servers || []) {
      if (!server?.id) continue;
      serverInfo.set(`${server.id.slice(0,4)}-${server.id.slice(-4)}`.toLowerCase(), server);
    }
    if (!featureSettings.pagination) decorate();
    render();
  });
  window.dispatchEvent(new CustomEvent("rsn-request-native-server-data"));

  chrome.storage.local.get([favoriteKey, avoidKey, filterKey], (data) => {
    replaceSaved(favorites, data[favoriteKey]);
    replaceSaved(avoided, data[avoidKey]);
    const saved = data[filterKey] || {};
    filters.min = saved.min === undefined ? filters.min : Math.max(0, Number(saved.min) || 0);
    filters.max = saved.max === undefined
      ? filters.max
      : saved.max === null || saved.max === "" ? null : Math.max(0, Number(saved.max));
    filters.favoritesOnly = Boolean(saved.favoritesOnly);
    minFilterInput.value = filters.min || "";
    maxFilterInput.value = filters.max ?? "";
    favoritesInput.checked = filters.favoritesOnly;
    render();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let changed = false;
    if (changes[favoriteKey]) {
      replaceSaved(favorites, changes[favoriteKey].newValue);
      changed = true;
    }
    if (changes[avoidKey]) {
      replaceSaved(avoided, changes[avoidKey].newValue);
      changed = true;
    }
    if (changed) render();
  });

  function shortId(card) { return card.textContent.match(/\bID\s*:\s*([0-9a-f]{4}-[0-9a-f]{4})\b/i)?.[1]?.toLowerCase() || null; }
  function normalizeServerId(value) {
    return String(value || "").replace(/^\s*ID\s*:\s*/i, "").trim().toLowerCase();
  }
  function isServerId(value) {
    return /^[0-9a-f]{4}-[0-9a-f]{4}$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
  }
  function matchesServerId(serverId, query) {
    const full = normalizeServerId(serverId);
    return full === query || (full.length >= 8 && `${full.slice(0,4)}-${full.slice(-4)}` === query);
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
        tools.innerHTML='<button class="rsn-card-tool" data-tool="favorite">☆</button><button class="rsn-card-tool" data-tool="avoid">⊘</button><button class="rsn-card-tool" data-tool="copy">Copy ID</button><button class="rsn-card-tool" data-tool="copy-link">Copy Link</button>';
        idElement.insertAdjacentElement("beforebegin", tools);
      }
      tools.dataset.id=id;
      const outerCard = details.closest(".rbx-public-game-server-item") || details.closest(".card-item-public-server");
      if (outerCard) {
        outerCard.dataset.rsnServerId = id;
        const avatarContainer = outerCard.querySelector(".player-thumbnails-container");
        if (avatarContainer) {
          const realSlots = [...avatarContainer.children].filter((slot) => !slot.classList.contains("rsn-ghost-player-slot"));
          const ghostSlots = [...avatarContainer.children].filter((slot) => slot.classList.contains("rsn-ghost-player-slot"));
          realSlots.forEach((slot) => slot.classList.toggle("rsn-more-player-slot", /^\+\d+\s*$/.test(slot.textContent.trim())));
          const morePlayerLabel = [...avatarContainer.querySelectorAll("*")].find((element) => /^\+\d+\s*$/.test(element.textContent.trim()));
          if (morePlayerLabel) morePlayerLabel.classList.add("rsn-more-player-label");
          const neededGhosts = Math.max(0, 6 - realSlots.length);
          ghostSlots.slice(neededGhosts).forEach((slot) => slot.remove());
          const slotTemplate = realSlots[0];
          for (let ghostIndex = ghostSlots.length; slotTemplate && ghostIndex < neededGhosts; ghostIndex += 1) {
            const ghost = slotTemplate.cloneNode(false);
            ghost.removeAttribute("id");
            ghost.classList.add("rsn-ghost-player-slot");
            ghost.setAttribute("aria-hidden", "true");
            avatarContainer.appendChild(ghost);
          }
        }
      }
      const favorite=tools.querySelector('[data-tool="favorite"]'); favorite.textContent=hasSaved(favorites,id)?"★":"☆"; favorite.classList.toggle("rsn-on",hasSaved(favorites,id));
      const avoid=tools.querySelector('[data-tool="avoid"]'); avoid.classList.toggle("rsn-avoided",hasSaved(avoided,id)); avoid.setAttribute("aria-pressed",String(hasSaved(avoided,id))); avoid.title=hasSaved(avoided,id)?"Remove avoid mark":"Mark server to avoid";
      const info=serverInfo.get(id);
      if(info?.id) tools.dataset.fullId=info.id;
    });
    applyFeatureVisibility();
  }
  function loadedServerCapacity() {
    return Math.max(-1, ...apiServers.map((server) => Number(server.maxPlayers) || -1));
  }
  function currentSortMode() {
    const control = sortRow?.querySelector("select,[role='combobox'],button");
    return control?.selectedOptions?.[0]?.textContent?.trim() || control?.textContent?.trim() || "Recommended For You";
  }
  function apiSortOrder() {
    return currentSortMode() === "Fewest Players" ? "Asc" : "Desc";
  }
  function visibleServers() {
    const matching = apiServers.filter((server) => {
      const id = server.id;
      const players = Number(server.playing);
      if (featureSettings.favorites && filters.favoritesOnly && !hasSaved(favorites,id)) return false;
      if (featureSettings.playerFilters && players < filters.min) return false;
      if (featureSettings.playerFilters && filters.max !== null && players > filters.max) return false;
      return true;
    });
    return matching;
  }

  function loadedPages() { return Math.max(1, Math.ceil(visibleServers().length / PAGE_SIZE)); }
  function exactTotalPages() {
    return state.total !== null && state.total !== undefined && !state.capped && Number.isFinite(Number(state.total))
      ? Math.max(1,Math.floor(Number(state.total)))
      : null;
  }
  function clampPage(page) {
    const normalized = Math.max(1,Math.floor(Number(page) || 1));
    const exactTotal = exactTotalPages();
    return exactTotal === null ? normalized : Math.min(normalized,exactTotal);
  }
  function hasActiveLocalFilter(capacity = loadedServerCapacity()) {
    const rangeFiltered = featureSettings.playerFilters && (
      filters.min > 0 || (filters.max !== null && (capacity < 0 || filters.max < capacity))
    );
    return rangeFiltered || (featureSettings.favorites && filters.favoritesOnly);
  }
  function hasMore() { return !state.ended && (state.nextCursor !== null || apiServers.length === 0); }
  function excludesFullServers() {
    const checkbox = [...section.querySelectorAll('input[type="checkbox"]')].find((input) =>
      /exclude full servers/i.test(input.closest("label")?.textContent || input.parentElement?.textContent || "")
    );
    return checkbox ? checkbox.checked : true;
  }
  function shortServerId(id) {
    return `${id.slice(0,4)}-${id.slice(-4)}`;
  }
  function replaceSaved(set, values) {
    set.clear();
    for (const value of Array.isArray(values) ? values : []) {
      const id = normalizeServerId(value);
      if (id) set.add(id);
    }
  }
  function hasSaved(set,id) {
    const normalized = normalizeServerId(id);
    return set.has(normalized) || set.has(shortServerId(normalized));
  }
  async function toggleSaved(storageKey, set, id) {
    const normalized = normalizeServerId(id);
    const short = shortServerId(normalized);
    const saved = await new Promise((resolve, reject) => {
      chrome.storage.local.get(storageKey, (data) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(data[storageKey]);
      });
    });
    replaceSaved(set, saved);
    if (hasSaved(set, normalized)) {
      set.delete(normalized);
      set.delete(short);
    } else {
      set.add(normalized);
    }
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [storageKey]:[...set] }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }
  function showThumbnail(token,imageUrl) {
    if (!imageUrl) return;
    for (const slot of apiGrid.querySelectorAll(".rsn-api-avatar-slot[data-player-token]")) {
      if (slot.dataset.playerToken !== token || slot.querySelector("img")) continue;
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      slot.replaceChildren(image);
    }
  }
  async function loadVisibleThumbnails(servers) {
    const tokens = [...new Set(servers.flatMap((server) =>
      (server.playerTokens || []).slice(0,5).map(String).filter(Boolean)
    ))];
    for (const token of tokens) showThumbnail(token,thumbnailCache.get(token));
    const missing = tokens.filter((token) => !thumbnailCache.has(token) && !thumbnailRequests.has(token));
    if (!missing.length) return;
    missing.forEach((token) => thumbnailRequests.add(token));
    try {
      const result = await sendMessage({ type:"GET_PLAYER_THUMBNAILS",tokens:missing });
      if (!result?.success) throw new Error(result?.error || "Thumbnail request failed.");
      for (const thumbnail of result.thumbnails || []) {
        if (!thumbnail.imageUrl) continue;
        thumbnailCache.set(thumbnail.token,thumbnail.imageUrl);
        showThumbnail(thumbnail.token,thumbnail.imageUrl);
      }
    } catch (error) {
      console.warn("Could not load player thumbnails:",error);
    } finally {
      missing.forEach((token) => thumbnailRequests.delete(token));
    }
  }
  function createApiCard(server) {
    const card = document.createElement("article");
    card.className = "rsn-api-card";
    card.dataset.rsnServerId = server.id;
    const avatars = document.createElement("div");
    avatars.className = "rsn-api-avatars";
    const playerTokens = (server.playerTokens || []).slice(0,5).map(String).filter(Boolean);
    for (let index = 0; index < 5; index += 1) {
      const slot = document.createElement("div");
      slot.className = "rsn-api-avatar-slot";
      const token = playerTokens[index];
      if (token) {
        slot.dataset.playerToken = token;
        const imageUrl = thumbnailCache.get(token);
        if (imageUrl) {
          const image = document.createElement("img");
          image.src = imageUrl;
          image.alt = "";
          image.loading = "lazy";
          image.decoding = "async";
          slot.appendChild(image);
        }
      } else {
        slot.classList.add("rsn-api-avatar-ghost");
      }
      avatars.appendChild(slot);
    }
    const more = document.createElement("div");
    const remainingPlayers = Math.max(0,Number(server.playing) - playerTokens.length);
    more.className = `rsn-api-avatar-slot${remainingPlayers ? "" : " rsn-api-avatar-ghost"}`;
    more.textContent = remainingPlayers ? `+${remainingPlayers}` : "";
    avatars.appendChild(more);
    const count = document.createElement("div");
    count.className = "rsn-api-player-count";
    count.textContent = `${server.playing} of ${server.maxPlayers} people max`;
    const progress = document.createElement("div");
    progress.className = "rsn-api-progress";
    const progressFill = document.createElement("span");
    progressFill.style.width = `${Math.max(0,Math.min(100,(Number(server.playing)/Math.max(1,Number(server.maxPlayers)))*100))}%`;
    progress.appendChild(progressFill);
    const join = document.createElement("button");
    join.className = "rsn-api-join";
    join.type = "button";
    join.textContent = "Join";
    join.dataset.serverId = server.id;
    const isAvoided = hasSaved(avoided,server.id);
    join.disabled = Number(server.playing) >= Number(server.maxPlayers) || isAvoided;
    join.title = isAvoided ? "Remove this server from Avoid before joining" : "Join this server";
    const tools = document.createElement("div");
    tools.className = "rsn-card-tools";
    tools.dataset.id = server.id;
    tools.dataset.fullId = server.id;
    tools.innerHTML = '<button class="rsn-card-tool" data-tool="favorite">☆</button><button class="rsn-card-tool" data-tool="avoid">⊘</button><button class="rsn-card-tool" data-tool="copy">Copy ID</button><button class="rsn-card-tool" data-tool="copy-link">Copy Link</button>';
    const favorite = tools.querySelector('[data-tool="favorite"]');
    favorite.textContent = hasSaved(favorites,server.id) ? "★" : "☆";
    favorite.classList.toggle("rsn-on",hasSaved(favorites,server.id));
    const avoid = tools.querySelector('[data-tool="avoid"]');
    avoid.classList.toggle("rsn-avoided",hasSaved(avoided,server.id));
    avoid.setAttribute("aria-pressed",String(hasSaved(avoided,server.id)));
    const id = document.createElement("div");
    id.className = "rsn-api-id";
    id.textContent = `ID: ${shortServerId(server.id)}`;
    card.append(avatars,count,progress,join,tools,id);
    return card;
  }
  function render() {
    state.page = clampPage(state.page);
    const capacity = loadedServerCapacity();
    if (capacity >= 0) {
      minFilterInput.max = capacity;
      maxFilterInput.max = capacity;
      if (capacity !== publishedCapacity) {
        publishedCapacity = capacity;
        chrome.storage.local.set({ [CURRENT_CAPACITY_KEY]:{ placeId:getPlaceId(), capacity } });
      }
    }
    const usable = visibleServers();
    const start = (state.page - 1) * PAGE_SIZE;
    const pageServers = usable.slice(start,start+PAGE_SIZE);
    apiGrid.replaceChildren(...pageServers.map(createApiCard));
    void loadVisibleThumbnails(pageServers);
    requestAnimationFrame(() => window.__rsnSyncPageTheme?.());
    applyFeatureVisibility();
    const locallyFiltered = hasActiveLocalFilter(capacity);
    const totalText = locallyFiltered
      ? `${loadedPages()} loaded`
      : state.capped ? `${Math.max(TOTAL_BLOCK, Math.ceil(state.page/TOTAL_BLOCK)*TOTAL_BLOCK)}+` : state.total ?? "…";
    label.textContent = `Page ${state.page} of ${totalText}`;
    input.value = state.page;
    const exactTotal = exactTotalPages();
    if (exactTotal === null) input.removeAttribute("max");
    else input.max = exactTotal;
    [...pager.querySelectorAll("button")].forEach((button) => button.disabled = state.busy);
    const atFirstPage = state.page <= 1;
    const atLastPage = exactTotal !== null && state.page >= exactTotal;
    for (const button of pager.querySelectorAll("[data-jump]")) {
      const jump = button.dataset.jump;
      if (jump === "first" || Number(jump) < 0) button.disabled = state.busy || atFirstPage;
      else if (Number(jump) > 0) button.disabled = state.busy || atLastPage;
    }
    const safetyMessage = state.largeGame
      ? `Disabled because this game has ${state.playerCount.toLocaleString()} active players.`
      : "";
    for (const button of [pager.querySelector('[data-jump="last"]'), pager.querySelector('[data-action="refresh"]')]) {
      button.disabled = state.busy || state.largeGame || locallyFiltered;
      button.title = locallyFiltered ? "Unavailable while a local server filter is active." : safetyMessage;
    }
  }
  window.addEventListener("rsn-feature-settings-changed", () => {
    const previousMin = filters.min;
    const previousMax = filters.max;
    filters.min = Math.max(0, Number(featureSettings.minPlayers) || 0);
    filters.max = featureSettings.maxPlayers === null || featureSettings.maxPlayers === undefined || featureSettings.maxPlayers === ""
      ? null
      : Math.max(filters.min, Number(featureSettings.maxPlayers) || 0);
    minFilterInput.value = filters.min || "";
    maxFilterInput.value = filters.max ?? "";
    if (previousMin !== filters.min || previousMax !== filters.max) state.page = 1;
    chrome.storage.local.set({ [filterKey]:filters });
    render();
  });
  async function loadBatch() {
    if (!hasMore()) return false;
    const version = state.requestVersion;
    const result = await sendMessage({
      type:"GET_PUBLIC_SERVERS",
      placeId:getPlaceId(),
      cursor:state.nextCursor,
      limit:100,
      excludeFullGames:excludesFullServers(),
      sortOrder:apiSortOrder()
    });
    if (!result?.success) throw new Error(result?.error || "Could not load public servers.");
    if (version !== state.requestVersion) return false;
    const known = new Set(apiServers.map((server) => server.id));
    for (const server of result.servers || []) {
      if (!server?.id || known.has(server.id)) continue;
      known.add(server.id);
      apiServers.push(server);
      serverInfo.set(shortServerId(server.id).toLowerCase(),server);
    }
    state.nextCursor = result.nextPageCursor || null;
    state.ended = !state.nextCursor;
    render();
    return Boolean(result.servers?.length);
  }
  async function go(targetValue) {
    const target = clampPage(targetValue);
    state.busy = true; status.textContent = `Loading page ${target}…`; render();
    try {
      while (visibleServers().length < target * PAGE_SIZE && hasMore()) {
        if (!(await loadBatch())) break;
        status.textContent = `Loading page ${target}… (${loadedPages()} ready)`;
      }
      state.page = Math.min(target, loadedPages());
      if (!hasMore()) { state.ended=true; state.total=loadedPages(); state.capped=false; }
      status.textContent = state.page < target ? `The last available page is ${state.page}.` : "";
    } catch (error) {
      state.page = Math.min(target,loadedPages(),exactTotalPages() ?? target);
      status.textContent = error.message;
    } finally {
      state.busy=false;
      render();
    }
  }
  async function total(force=false, exact=false) {
    if (state.largeGame) return;
    if (hasActiveLocalFilter()) {
      status.textContent = "Last-page totals are unavailable while a local filter is active.";
      render();
      return;
    }
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
      if (!result?.success) throw new Error(result?.error || "Could not count public servers.");
      state.total=result.pages; state.capped=result.capped;
      state.page=clampPage(state.page);
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
        totalStatus.textContent = `Last and Refresh total button disabled for larger games (${result.playing.toLocaleString()} active players).`;
      } else {
        totalStatus.textContent = "";
      }
      render();
      return state.largeGame;
    } catch (error) {
      console.warn("Could not check active player count:", error);
      return false;
    }
  }

  function launchServerById(serverId) {
    chrome.storage.local.set({ [`rsn-last-server-${getPlaceId()}`]:serverId });
    window.dispatchEvent(new CustomEvent("rsn-join-game-instance", {
      detail:{ placeId:getPlaceId(),serverId }
    }));
  }

  async function joinServerId() {
    const query = normalizeServerId(serverSearchInput.value);
    section.querySelectorAll(".rsn-search-match").forEach((card) => card.classList.remove("rsn-search-match"));
    if (!isServerId(query)) {
      status.textContent = "Enter a full server ID or a short ID like abcd-1234.";
      return;
    }

    const usable = visibleServers();
    const index = usable.findIndex((server) => matchesServerId(server.id,query));
    if (index >= 0) {
      if (hasSaved(avoided, usable[index].id)) {
        status.textContent = "This server is on your Avoid list. Remove its Avoid mark before joining.";
        return;
      }
      state.page = Math.floor(index / PAGE_SIZE) + 1;
      render();
      const loadedMatch = [...apiGrid.querySelectorAll(".rsn-api-card")].find((card) => matchesServerId(card.dataset.rsnServerId,query));
      loadedMatch?.classList.add("rsn-search-match");
      loadedMatch?.scrollIntoView({ behavior:"smooth", block:"center" });
      launchServerById(usable[index].id);
      status.textContent = "Joining server…";
      setTimeout(() => loadedMatch?.classList.remove("rsn-search-match"),3500);
      return;
    }

    if (query.length === 36) {
      if (hasSaved(avoided, query)) {
        status.textContent = "This server is on your Avoid list. Remove its Avoid mark before joining.";
        return;
      }
      launchServerById(query);
      status.textContent = "Joining server…";
      return;
    }

    status.textContent = "Resolving shortened server ID…";
    serverIdJoinButton.disabled = true;
    try {
      const result = await sendMessage({ type:"SEARCH_SERVER_ID", placeId:getPlaceId(), serverId:query });
      if (!result.server) {
        status.textContent = result.capped ? "Server not found in the first 10,000 public servers." : "Server ID not found in this game.";
        return;
      }
      if (result.server.playing >= result.server.maxPlayers) {
        status.textContent = "That server is currently full.";
        return;
      }
      if (hasSaved(avoided, result.server.id)) {
        status.textContent = "This server is on your Avoid list. Remove its Avoid mark before joining.";
        return;
      }
      launchServerById(result.server.id);
      status.textContent = "Joining server…";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      serverIdJoinButton.disabled = false;
    }
  }

  pager.addEventListener("click", async (event) => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.jump === "first") go(1);
    else if (button.dataset.jump === "last") total(true,true);
    else if (button.dataset.jump) go(state.page + Number(button.dataset.jump));
    else if (button.dataset.action === "go") go(input.value);
    else if (button.dataset.action === "refresh") chrome.storage.local.remove(totalKey, () => total(true,false));
    else if (button.dataset.action === "clear-avoided") { avoided.clear(); chrome.storage.local.set({[avoidKey]:[]}); render(); }
  });
  filterBar.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.action === "filter-search") applyFilters();
    else if (button?.dataset.action === "filter-reset") resetMinMax();
  });
  serverSearch.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.action === "server-id-join") await joinServerId();
  });
  section.addEventListener("click", async (event) => {
    const joinButton = event.target.closest(".rsn-api-join");
    if (joinButton?.dataset.serverId) {
      const serverId = joinButton.dataset.serverId;
      if (hasSaved(avoided, serverId)) {
        event.preventDefault();
        event.stopPropagation();
        status.textContent = "This server is on your Avoid list. Remove its Avoid mark before joining.";
        return;
      }
      chrome.storage.local.set({ [`rsn-last-server-${getPlaceId()}`]:serverId });
      window.dispatchEvent(new CustomEvent("rsn-join-game-instance", { detail:{ placeId:getPlaceId(),serverId } }));
      return;
    }
    const tool=event.target.closest("[data-tool]"); if(!tool)return;
    event.preventDefault();event.stopPropagation();
    const row=tool.closest(".rsn-card-tools");const id=row?.dataset.id;if(!id)return;
    if(tool.dataset.tool==="favorite"){
      tool.disabled = true;
      try {
        await toggleSaved(favoriteKey, favorites, row.dataset.fullId || id);
        render();
      } catch (error) {
        status.textContent = `Could not save favorite: ${error.message}`;
        tool.disabled = false;
      }
    }
    if(tool.dataset.tool==="avoid"){
      tool.disabled = true;
      try {
        await toggleSaved(avoidKey, avoided, row.dataset.fullId || id);
        render();
      } catch (error) {
        status.textContent = `Could not save avoid mark: ${error.message}`;
        tool.disabled = false;
      }
    }
    if(tool.dataset.tool==="copy" || tool.dataset.tool==="copy-link"){
      clearTimeout(copyResetTimers.get(tool));
      const copiesJoinLink = tool.dataset.tool === "copy-link";
      const fullServerId = row.dataset.fullId || id;
      const defaultLabel = copiesJoinLink ? "Copy Link" : "Copy ID";
      try{
        if (copiesJoinLink && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fullServerId)) {
          throw new Error("Full server ID unavailable");
        }
        const value = copiesJoinLink
          ? `roblox://experiences/start?placeId=${encodeURIComponent(getPlaceId())}&gameInstanceId=${encodeURIComponent(fullServerId)}`
          : fullServerId;
        await navigator.clipboard.writeText(value);
        tool.textContent=copiesJoinLink?"Link copied!":"Copied!";
        tool.classList.add("rsn-copied");
        status.textContent=copiesJoinLink?"Server join link copied.":"Server ID copied.";
      }catch{
        tool.textContent="Try again";
        tool.classList.remove("rsn-copied");
        status.textContent=copiesJoinLink?"Could not copy a join link for this server.":"Could not copy server ID.";
      }
      copyResetTimers.set(tool,setTimeout(()=>{tool.textContent=defaultLabel;tool.classList.remove("rsn-copied");copyResetTimers.delete(tool);},1400));
    }
  },true);

  input.addEventListener("keydown", (event) => { if (event.key === "Enter") go(input.value); });
  serverSearchInput.addEventListener("keydown", (event) => { if (event.key === "Enter") joinServerId(); });
  function applyFilters() {
    const minValue = minFilterInput.value;
    const maxValue = maxFilterInput.value;
    const capacity = loadedServerCapacity();
    const clamp = (value) => capacity >= 0 ? Math.min(capacity, value) : value;
    const nextMin = clamp(Math.max(0, Number(minValue) || 0));
    const nextMax = maxValue === "" ? null : clamp(Math.max(0, Number(maxValue)));
    minFilterInput.value = minValue === "" ? "" : nextMin;
    maxFilterInput.value = maxValue === "" ? "" : nextMax;
    if (nextMax !== null && nextMin > nextMax) {
      status.textContent = "Minimum players cannot be higher than maximum players.";
      return;
    }
    filters.min = nextMin;
    filters.max = nextMax;
    filters.favoritesOnly = favoritesInput.checked;
    chrome.storage.local.set({ [filterKey]:filters });
    state.page = 1;
    render();
    const matching = visibleServers().length;
    status.textContent = minValue === "" && maxValue === ""
      ? `Player filters cleared. ${matching} loaded servers available.`
      : `${matching} loaded servers match the Min/Max filter.`;
  }
  function resetMinMax() {
    minFilterInput.value = "";
    maxFilterInput.value = "";
    filters.min = 0;
    filters.max = null;
    filters.favoritesOnly = favoritesInput.checked;
    chrome.storage.local.set({ [filterKey]:filters });
    state.page = 1;
    render();
    status.textContent = `Min/Max cleared. ${visibleServers().length} loaded servers available.`;
  }
  favoritesInput.addEventListener("change", applyFilters);
  for (const field of [minFilterInput, maxFilterInput]) {
    field.addEventListener("keydown", (event) => { if (event.key === "Enter") applyFilters(); });
  }

  function resetAfterNativeControl() {
    clearTimeout(resetTimer);
    state.requestVersion += 1;
    apiServers.length = 0;
    state.page=1; state.total=null; state.capped=false; state.ended=false; state.busy=false; state.nextCursor=null;
    status.textContent="Refreshing servers…";
    chrome.storage.local.remove(totalKey);
    render();
    resetTimer=setTimeout(() => {
      const button=loadMoreButton(section); if(button) button.style.display="none";
      status.textContent=""; go(1); total(true,false);
    }, 700);
  }

  section.addEventListener("change", (event) => {
    if (event.target.matches('select,input[type="checkbox"]') && !event.target.matches("[data-filter]")) resetAfterNativeControl();
  });
  document.addEventListener("click", (event) => {
    if (pager.contains(event.target)) return;
    const text=event.target.closest("button,[role='button'],[role='option']")?.textContent.trim();
    if (text === "Refresh" || ["Recommended For You","Best Connection (Ping)","Most Players","Fewest Players"].includes(text)) {
      resetAfterNativeControl();
    }
  }, true);

  go(1).then(async () => {
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
