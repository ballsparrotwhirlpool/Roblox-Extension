const SETTINGS_KEY = "rsn-feature-settings";
const defaults = {
  randomServer:true,
  rejoinServer:true,
  pagination:true,
  playerFilters:true,
  totalControls:true,
  favorites:true,
  avoid:true,
  copyId:true
};

const controls = [...document.querySelectorAll("[data-feature]")];
const status = document.querySelector("#status");
const toggleAll = document.querySelector("#toggle-all");

function updateToggleAllLabel() {
  toggleAll.textContent = controls.every((control) => control.checked) ? "Disable all" : "Enable all";
}

function saveSettings() {
  const settings = Object.fromEntries(controls.map((item) => [item.dataset.feature, item.checked]));
  chrome.storage.local.set({ [SETTINGS_KEY]:settings }, () => {
    status.textContent = "Updated on the Roblox page.";
    updateToggleAllLabel();
    setTimeout(() => { status.textContent = "Changes apply immediately."; }, 1200);
  });
}

chrome.storage.local.get(SETTINGS_KEY, (result) => {
  const settings = { ...defaults, ...(result[SETTINGS_KEY] || {}) };
  for (const control of controls) control.checked = settings[control.dataset.feature] !== false;
  updateToggleAllLabel();
});

for (const control of controls) {
  control.addEventListener("change", saveSettings);
}

toggleAll.addEventListener("click", () => {
  const enableAll = !controls.every((control) => control.checked);
  for (const control of controls) control.checked = enableAll;
  saveSettings();
});
