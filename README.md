# Roblox Server Navigator

A Chrome extension that improves Roblox's game and server pages with faster navigation, server filters, card utilities, and extra join options.

## Features

- Browse servers in pages of 8.
- Move forward or backward by 1, 10, or 100 pages.
- Jump to a custom page, the first page, or the last page.
- Filter loaded servers by minimum and maximum player count.
- Favorite, avoid, and copy the ID of individual servers.
- Join a random server while favoring lower-ping choices.
- Rejoin the last server selected through Random or a server's Join button.
- Show Roblox player avatars on server cards.
- Disable individual features from the extension popup.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this extension folder.
5. Open or refresh a Roblox game page.

After changing the extension's files, press **Reload** on its card in `chrome://extensions`, then refresh Roblox.

## Using the popup

Click the extension icon in Chrome to show or hide:

- Random and Rejoin buttons
- Custom page navigation
- Min/Max player filters
- Last-page and total-count controls
- Favorite, Avoid, and Copy ID utilities

Settings are saved automatically and update the Roblox page immediately.

## Notes

- Min/Max filters apply to servers Roblox has already loaded. They do not search every active server.
- Favorite server instances may disappear when the server closes.
- The normal Roblox Play button cannot be used to remember a specific server. Use Random or a server card's Join button before using Rejoin.
- Exact ping cannot be shown reliably on Roblox's personalized native server cards because their matching ping information is not exposed.
- Last-page counting is disabled for very large games to prevent slow or failed requests.
