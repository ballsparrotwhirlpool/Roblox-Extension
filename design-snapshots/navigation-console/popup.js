const SETTINGS_KEY = "rsn-feature-settings";
const defaults = { randomServer:true, rejoinServer:true, pagination:true, playerFilters:true, minPlayers:0, maxPlayers:null, totalControls:true, favorites:true, avoid:true, copyId:true };
const switches = [...document.querySelectorAll("input[data-feature]")];
const playerFilterToggle = document.querySelector("#player-filter-toggle");
const playerFilterControl = document.querySelector("#player-filter-control");
const minPlayers = document.querySelector("#min-players");
const maxPlayers = document.querySelector("#max-players");
const copyAction = document.querySelector("[data-action-feature='copyId']");
const statusText = document.querySelector("#status > span:last-child");
const toggleAll = document.querySelector("#toggle-all");
const enabledCount = document.querySelector("#enabled-count");
const undoToast = document.querySelector("#undo-toast");
const undoButton = document.querySelector("#undo");
let settings = { ...defaults };
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
  copyAction.querySelector(".action-state").textContent = settings.copyId ? "On" : "Off";
  minPlayers.value = settings.minPlayers > 0 ? settings.minPlayers : "";
  maxPlayers.value = settings.maxPlayers === null ? "" : settings.maxPlayers;
  const values = featureValues();
  const active = values.filter(Boolean).length;
  enabledCount.textContent = `${active} of ${values.length} active`;
  toggleAll.textContent = values.every(Boolean) ? "Power down" : "Enable all";
}

function dismissUndo() {
  clearTimeout(undoTimer);
  undoToast.hidden = true;
  undoSettings = null;
}

function showUndo(message) {
  undoToast.querySelector("span").textContent = message;
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
  let maximum = maxPlayers.value === "" ? null : Math.max(0, Math.floor(Number(maxPlayers.value) || 0));
  if (maximum !== null && maximum < minimum) maximum = minimum;
  return { minimum, maximum };
}

chrome.storage.local.get(SETTINGS_KEY, (result) => {
  settings = { ...defaults, ...(result[SETTINGS_KEY] || {}) };
  syncUI();
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
  for (const key of ["randomServer","rejoinServer","pagination","playerFilters","totalControls","favorites","avoid","copyId"]) settings[key] = enableAll;
  saveSettings();
  showUndo(enableAll ? "All features powered up" : "Navigation deck powered down");
});

undoButton.addEventListener("click", () => {
  if (!undoSettings) return;
  settings = { ...undoSettings };
  clearTimeout(undoTimer);
  undoToast.hidden = true;
  undoSettings = null;
  saveSettings("Previous setup restored");
});
