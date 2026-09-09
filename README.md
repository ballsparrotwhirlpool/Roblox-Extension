# Roblox Server Navigator

A Chrome extension that adds faster navigation, player filters, card tools, and extra join options to Roblox game server pages.

## Features

- Browse servers in pages of 8.
- Move backward or forward by 1, 10, or 100 pages.
- Jump to a custom page, the first page, or the last page.
- Search for a server using its full ID or the shortened ID shown on a card.
- Filter loaded servers by minimum and maximum player count.
- Limit the Maximum field to the current game's detected server capacity.
- Favorite servers for quick visual reference.
- Mark servers to avoid without removing their cards; marked Avoid buttons turn red.
- Copy a server ID with temporary **Copied!** feedback.
- Join a random server while favoring lower-ping choices.
- Rejoin the last server selected through Random or a server's Join button.
- Show Roblox player avatars on server cards.
- Enable or disable each feature from the extension popup.

## Popup

The popup provides controls for:

- Random and Rejoin buttons
- Server ID search with loaded-card highlighting and direct Join
- Page navigation
- Minimum and maximum player filters
- Last-page and total-count controls
- Favorites, Avoid, and Copy ID

Changes are saved automatically and applied to an open Roblox page immediately. The feature counter and master control show one of three states:

- **Active** — all 8 features are enabled
- **Mixed** — some features are enabled
- **Off** — all features are disabled

The popup also includes:

- A saved Light/Dark theme slider
- A Reset button that returns Minimum to `0` and Maximum to the detected server cap
- An Undo action after changing all features at once

## Toolbar icon

The block-style **R** icon changes color to show extension status:

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
- Roblox API host access is used to load public-server information, game player counts, and avatar thumbnails.
- Content scripts run only on Roblox game pages.

## Notes

- Min/Max filters apply only to servers Roblox has already loaded; they do not search every active server.
- Server ID search checks loaded cards first, then searches up to 10,000 public servers through the Roblox API.
- Open or refresh a Roblox game page before using the popup so the current server capacity can be detected.
- Favorite and Avoid marks refer to individual server instances and may become irrelevant after a server closes.
- **Clear avoided** removes all Avoid marks for the current game.
- The standard Roblox Play button cannot remember a specific server. Use Random or a server card's Join button before using Rejoin.
- Exact ping cannot be shown reliably on Roblox's personalized native server cards because matching ping information is not exposed.
- Last-page counting is disabled for very large games to avoid slow or failed requests.
