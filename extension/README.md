# Hero Wars Snapshot Chrome extension

This unpacked Manifest V3 extension creates a local JSON snapshot and opens it
in the included viewer.

## Install and try it

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this `extension` directory.
4. Open `https://www.hero-wars.com/` and sign in normally.
5. Click **Hero Wars Snapshot**, then **Refresh & Capture**.
6. Let the game finish loading. The viewer opens automatically when the three
   roster collections have arrived. Use **Download JSON** in the viewer to save
   the snapshot.

The optional **Support for $1** button opens the Game Tool Works Buy Me a Coffee
page in a new tab. It does not unlock features, run automatically, or transmit
snapshot data.

The **Feedback & Help** button opens this project's public GitHub Issues page.
No snapshot data is included in the link or submitted automatically.

If Chrome reports an extension error after files change, click its **Reload**
button on `chrome://extensions`.

## Security boundaries

- Content scripts match only `https://www.hero-wars.com/*`.
- API observation accepts only the game's exact HTTPS API host and path.
- Only nine recognized account-data result types are forwarded. Request
  headers, cookies, authorization context, request arguments, and unrelated
  network responses are discarded.
- Static names and image locations come only from an allowlist of official game
  CDN hosts and are fetched with credentials omitted.
- No data is uploaded. Snapshots and resolved image URLs are stored only in
  `chrome.storage.local` on this Chrome profile.
- The extension does not modify game data or automate gameplay. Its only page
  action is the refresh you explicitly request.

Chrome displays the CDN hosts in the permission list because the background
worker needs to read the game's public names and asset indexes. The extension
has no permission to run page code on those CDN sites.

## Development

Reusable extraction logic is browser-native JavaScript in `lib/`. Run the
dependency-free tests from the repository root with:

```powershell
.\tools\node\node.exe --test
```
