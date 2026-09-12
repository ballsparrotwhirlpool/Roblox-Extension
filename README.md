# Roblox Server Navigator

A Chrome extension that adds faster navigation, player filters, card tools, and extra join options to Roblox game server pages.

## Features

- Browse lightweight server cards in pages of 8, backed by cached 100-server API batches.
- Move backward or forward by 1, 10, or 100 pages.
- Jump to a custom page, the first page, or the last page.
- Join a server using its full ID or a shortened ID that can be resolved from loaded/API results.
- Filter loaded servers by minimum and maximum player count.
- Limit the Maximum field to the current game's detected server capacity.
- Favorite servers for quick visual reference.
- Mark servers to avoid without removing their cards; marked Avoid buttons turn red.
- Copy a server ID with temporary **Copied!** feedback.
- Copy a `roblox://` join link for a specific server.
- Join a random available server.
- Rejoin the last server selected through Random or a server's Join button.
- Show player counts, capacity, server IDs, and cached player icons while fetching avatars only for the visible page.
- Enable or disable each feature from the extension popup.

## Popup

The popup provides controls for:

- Random and Rejoin buttons
- Join by full server ID immediately, or resolve a shortened loaded/API server ID before joining
- Page navigation
- Minimum and maximum player filters
- Last-page and total-count controls
- Favorites, Avoid, Copy ID, and Copy Join Link

Changes are saved automatically and applied to an open Roblox page immediately. The feature counter and master control show one of three states:

- **Active** — all 9 features are enabled
- **Mixed** — some features are enabled
- **Off** — all features are disabled

The popup also includes:

- A saved Light/Dark theme slider
- A Reset button that returns Minimum to `0` and Maximum to the detected server cap
- An Undo action after changing all features at once

## Toolbar icon

The three-bar toolbar icon highlights the current extension status while muting the other two states:

- **Green** on Roblox when all features are active
- **Orange** on Roblox when the feature selection is mixed
- **Red** on Roblox when all features are off
- **Red** on non-Roblox websites

The popup remains available on every website, even when the icon is red.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this extension folder.
5. Open or refresh a Roblox game page.

After changing extension files, select **Reload** on the extension's card and refresh the Roblox page.

## Permissions

- `storage` saves feature settings, popup theme, favorites, avoided-server marks, filters, and recent server information locally.
- Roblox API host access is used to load public-server information and game player counts.
- Content scripts run only on Roblox game pages.

## Notes

- Min/Max filters apply to the API server batches loaded by the extension. Moving farther through filtered results automatically loads additional batches as needed.
- Join by server ID launches full IDs immediately. Short IDs check loaded cards first, then search the public-server results Roblox makes available.
- Open or refresh a Roblox game page before using the popup so the current server capacity can be detected.
- Favorite and Avoid marks refer to individual server instances and may become irrelevant after a server closes.
- **Clear avoided** removes all Avoid marks for the current game.
- The standard Roblox Play button cannot remember a specific server. Use Random or a server card's Join button before using Rejoin.
- The public-server API's `ping` value is not shown because it does not represent the installing user's in-game latency.
- Last-page counting is disabled for very large games to avoid slow or failed requests.
