# Chrome Web Store publication checklist

## 1. Developer account

1. Sign in with the dedicated Game Tool Works Google account.
2. Enable 2-Step Verification.
3. Register in the Chrome Web Store Developer Dashboard and pay Google's
   one-time registration fee.
4. Use a monitored Game Tool Works support email. The developer account email
   cannot simply be changed later; items must be transferred to another account.

## 2. Public repository and policy URLs

This project's public repository is:

`https://github.com/gametoolworks/HeroWarsDominionEraSnapShot`

Use these dashboard URLs after confirming they resolve publicly:

- Homepage: `https://github.com/gametoolworks/HeroWarsDominionEraSnapShot`
- Support: `https://github.com/gametoolworks/HeroWarsDominionEraSnapShot/issues`
- Privacy policy: `https://github.com/gametoolworks/HeroWarsDominionEraSnapShot/blob/main/PRIVACY.md`

Enable GitHub Issues before using the support URL.

## 3. Final local test and package

1. Load `extension/` unpacked in Chrome.
2. Test a fresh capture, viewer, JSON download, Open Latest Snapshot, and the
   optional support link.
3. Inspect the downloaded JSON and verify it contains no account identifier,
   email, credentials, chat, or billing information.
4. Run `npm test`.
5. Run `npm run package`.
6. Upload `dist/hero-wars-snapshot-1.0.0.zip`. Its `manifest.json` is already at
   the archive root.

Every later upload must use a higher version in `extension/manifest.json`.

## 4. Suggested listing copy

### Title

Hero Wars Snapshot

### Summary

Export a private local JSON snapshot of your Hero Wars heroes, titans, pets,
inventory, teams, and progression.

### Detailed description

Hero Wars Snapshot creates a readable, downloadable snapshot of your Hero Wars:
Dominion Era account progression.

Features:

- View heroes, titans, pets, resources, inventory, and saved teams.
- Use official game names and imagery from public game asset indexes.
- Download a structured JSON snapshot for personal tools and analysis.
- Refresh and capture the latest data with one click.
- Keep all captured account data locally in your Chrome profile.

The extension does not upload snapshots, collect analytics, automate gameplay,
or modify game data. It runs only on the official Hero Wars website. The
optional support link opens only when clicked and does not affect functionality.

This is an unofficial community utility from Game Tool Works. It is not
affiliated with or endorsed by Nexters. Hero Wars and related assets belong to
their respective owners.

Suggested category: **Tools**. Language: **English**.

## 5. Privacy practices answers

### Single purpose

Create, display, and locally export a user-requested snapshot of Hero Wars
account progression.

### Permission justifications

- `storage`: Stores the latest sanitized snapshot and resolved public image
  URLs locally so the viewer can reopen them.
- `https://www.hero-wars.com/*`: Runs the capture listener only on the official
  game site and permits the explicit Refresh & Capture action.
- The three `heroeswb` CDN hosts: Fetches public localization, definition, and
  image index files with credentials omitted. No user data is sent to them by
  the extension.

### Data disclosure

Disclose **website content** and account/gameplay progression data because the
extension processes game-page responses. State that it is used only for the
local snapshot feature, is not transmitted to the developer, is not sold or
used for advertising, and is not read by humans.

Do not claim that authentication information, financial information, personal
communications, location, browsing history, or personally identifying account
details are collected; the extension explicitly discards those fields.

Provide the public `PRIVACY.md` URL in the dashboard's designated Privacy Policy
field, not merely in the listing description.

## 6. Store graphics

- Store icon: `extension/assets/icon-128.png` (128x128).
- At least one real screenshot is required; use 1280x800 and preferably provide
  three: popup, overview, and an entity/inventory view.
- Do not use a real user's account identifiers or browser chrome containing
  personal bookmarks/profile information in screenshots.
- Small promo tile: 440x280 PNG or JPEG.
- Marquee image: 1400x560 is optional unless requested by the dashboard.

Screenshots must show the current extension and should be full-bleed, square
cornered, and free of misleading claims.

## 7. Submit and review

Upload the ZIP, complete Store Listing and Privacy Practices, choose visibility,
and submit for review. New developers and extensions with host access can take
longer to review. If a submission remains pending beyond three weeks, Google's
review documentation recommends contacting developer support.

Do not publish until the privacy-policy URL works publicly and the final ZIP has
been retested as an unpacked extension.
