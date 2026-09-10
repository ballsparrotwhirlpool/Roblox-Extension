const SETTINGS_KEY = "rsn-feature-settings";
const THEME_KEY = "rsn-popup-theme";
const CAPACITY_KEY = "rsn-current-server-capacity";
const defaults = { randomServer:true, rejoinServer:true, pagination:true, serverIdSearch:true, playerFilters:true, minPlayers:0, maxPlayers:null, totalControls:true, favorites:true, avoid:true, copyId:true };
const switches = [...document.querySelectorAll("input[data-feature]")];
const playerFilterToggle = document.querySelector("#player-filter-toggle");
const playerFilterControl = document.querySelector("#player-filter-control");
const minPlayers = document.querySelector("#min-players");
const maxPlayers = document.querySelector("#max-players");
const resetPlayerRange = document.querySelector("#reset-player-range");
const copyAction = document.querySelector("[data-action-feature='copyId']");
const statusText = document.querySelector("#status > span:last-child");
const toggleAll = document.querySelector("#toggle-all");
const enabledCount = document.querySelector("#enabled-count");
const statusDot = document.querySelector(".status-dot");
const undoToast = document.querySelector("#undo-toast");
const undoButton = document.querySelector("#undo");
const themeToggle = document.querySelector("#theme-toggle");
const themeLabel = themeToggle.querySelector(".theme-label");
const themeKnob = themeToggle.querySelector(".theme-knob");
let settings = { ...defaults };
let serverCapacity = null;
let undoSettings = null;
let undoTimer = null;
let statusTimer = null;

function featureValues() {
  return [...switches.map((control) => control.checked), settings.playerFilters, settings.copyId];
}

function syncUI() {
  for (const control of switches) control.checked = settings[control.dataset.feature] !== false;
  playerFilterToggle.setAttribute("aria-pressed", String(settings.playerFilters));
  playerFilterToggle.textContent = settings.playerFilters ? "Shown" : "Hidden";
  playerFilterControl.classList.toggle("is-hidden", !settings.playerFilters);
  copyAction.setAttribute("aria-pressed", String(settings.copyId));
  copyAction.querySelector(".action-state").textContent = settings.copyId ? "Active" : "Off";
  minPlayers.value = settings.minPlayers > 0 ? settings.minPlayers : "";
  maxPlayers.max = serverCapacity ?? "";
  maxPlayers.placeholder = serverCapacity === null ? "Server cap" : String(serverCapacity);
  maxPlayers.value = settings.maxPlayers === null ? (serverCapacity ?? "") : Math.min(settings.maxPlayers, serverCapacity ?? settings.maxPlayers);
  const values = featureValues();
  const active = values.filter(Boolean).length;
  const allActive = active === values.length;
  const allOff = active === 0;
  enabledCount.textContent = `${active} of ${values.length} active`;
  statusDot.dataset.state = allOff ? "off" : allActive ? "active" : "mixed";
  toggleAll.textContent = allActive ? "All features: Active" : allOff ? "All features: Off" : "All features: Mixed";
  toggleAll.dataset.state = allOff ? "off" : allActive ? "on" : "mixed";
}

function dismissUndo() {
  clearTimeout(undoTimer);
  undoToast.hidden = true;
  undoSettings = null;
}

function showUndo(message) {
  undoToast.hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(dismissUndo, 5000);
}

function saveSettings(message = "Updated on the Roblox page") {
  chrome.storage.local.set({ [SETTINGS_KEY]:settings }, () => {
    syncUI();
    statusText.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusText.textContent = "Changes apply immediately"; }, 1200);
  });
}

function normalizedRange() {
  const minimum = minPlayers.value === "" ? 0 : Math.max(0, Math.floor(Number(minPlayers.value) || 0));
  let maximum = maxPlayers.value === "" ? serverCapacity : Math.max(0, Math.floor(Number(maxPlayers.value) || 0));
  if (serverCapacity !== null && maximum !== null) maximum = Math.min(maximum, serverCapacity);
  if (maximum !== null && maximum < minimum) maximum = minimum;
  return { minimum, maximum };
}

chrome.storage.local.get(SETTINGS_KEY, (result) => {
  settings = { ...defaults, ...(result[SETTINGS_KEY] || {}) };
  syncUI();
});

chrome.storage.local.get(CAPACITY_KEY, (result) => {
  const capacity = Number(result[CAPACITY_KEY]?.capacity);
  serverCapacity = Number.isFinite(capacity) && capacity >= 0 ? capacity : null;
  syncUI();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[CAPACITY_KEY]) return;
  const capacity = Number(changes[CAPACITY_KEY].newValue?.capacity);
  serverCapacity = Number.isFinite(capacity) && capacity >= 0 ? capacity : null;
  syncUI();
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  themeLabel.textContent = theme === "dark" ? "Dark" : "Light";
  themeKnob.textContent = theme === "dark" ? "☾" : "☀";
  themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  themeToggle.title = themeToggle.getAttribute("aria-label");
}

chrome.storage.local.get(THEME_KEY, (result) => {
  const theme = result[THEME_KEY] || "light";
  applyTheme(theme);
});

themeToggle.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  chrome.storage.local.set({ [THEME_KEY]:theme });
});

for (const control of switches) {
  control.addEventListener("change", () => {
    dismissUndo();
    settings[control.dataset.feature] = control.checked;
    saveSettings();
  });
}

for (const field of [minPlayers, maxPlayers]) {
  field.addEventListener("change", () => {
    dismissUndo();
    const range = normalizedRange();
    settings.minPlayers = range.minimum;
    settings.maxPlayers = range.maximum;
    settings.playerFilters = true;
    saveSettings("Player range updated");
  });
}

resetPlayerRange.addEventListener("click", () => {
  dismissUndo();
  settings.minPlayers = 0;
  settings.maxPlayers = serverCapacity;
  saveSettings("Player range reset");
});

playerFilterToggle.addEventListener("click", () => {
  dismissUndo();
  settings.playerFilters = !settings.playerFilters;
  saveSettings();
});

copyAction.addEventListener("click", () => {
  dismissUndo();
  settings.copyId = !settings.copyId;
  saveSettings(settings.copyId ? "Copy action added to cards" : "Copy action hidden from cards");
});

toggleAll.addEventListener("click", () => {
  undoSettings = { ...settings };
  const enableAll = !featureValues().every(Boolean);
  for (const key of ["randomServer","rejoinServer","pagination","serverIdSearch","playerFilters","totalControls","favorites","avoid","copyId"]) settings[key] = enableAll;
  saveSettings();
  showUndo(enableAll ? "All features on" : "All features off");
});

undoButton.addEventListener("click", () => {
  if (!undoSettings) return;
  settings = { ...undoSettings };
  clearTimeout(undoTimer);
  undoToast.hidden = true;
  undoSettings = null;
  saveSettings("Previous setup restored");
});
