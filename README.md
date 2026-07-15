# Hero Wars Snapshot

An unofficial, privacy-conscious Chrome extension that exports a local JSON
snapshot of Hero Wars: Dominion Era account progression and displays it in a
readable viewer.

Hero Wars and all related game names and assets are property of their
respective owners. This project is not affiliated with or endorsed by Nexters.

## Privacy and safety

- Runs page code only on `https://www.hero-wars.com/`.
- Retains only recognized gameplay/account-progression response fields.
- Does not retain request bodies, credentials, cookies, headers, email, chat,
  billing information, or authentication context.
- Stores snapshots locally in the user's Chrome extension storage.
- Sends no snapshot or account data to Game Tool Works or any third party.
- Opens the optional Buy Me a Coffee page only when the user clicks its button.

See [PRIVACY.md](PRIVACY.md) and [extension/SECURITY.md](extension/SECURITY.md).

## Local installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose the `extension` directory.
4. Open Hero Wars and use **Refresh & Capture** from the extension popup.

## Development

Requires a current Node.js release for tests:

```powershell
npm test
```

Create the Chrome Web Store ZIP on Windows:

```powershell
npm run package
```

The package is written to `dist/hero-wars-snapshot-<version>.zip`. The archive
contains `manifest.json` at its root, as required for extension upload.

## Repository hygiene

Never commit HAR files or exported snapshots. HAR files can contain live
credentials, personal information, and full account responses. The ignore file
blocks common capture and snapshot filenames, and the packaging script rejects
them if they appear inside the extension directory.
