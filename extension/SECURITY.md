# Security design

The main-world listener must see responses made by the game, but it uses a
strict allowlist and emits only `{ident, response}` pairs. In particular, the
game request body is parsed in place and is never forwarded or stored. This
prevents its authentication context from entering extension storage.

The isolated bridge accepts only the two internal message kinds used by the
listener. The service worker independently validates the sending tab and every
static-data URL, so a forged page event cannot expand host access.

Snapshots contain gameplay/account progression information. They do not
contain passwords, cookies, headers, email, chat, payment data, or the raw API
request context. Removing the extension through Chrome also removes its local
extension storage.
