# miniflux-kifte-custom

Per-user CSS/JS customizations for [Miniflux](https://miniflux.app/) — appearance theme + client-side `/feeds` & `/unread` category grouping.

## Why this exists

Miniflux has **no global `CUSTOM_CSS` / `CUSTOM_JS` environment variable** (verified against the full config docs). The only customization surface is **per-user DB columns** `users.stylesheet` and `users.custom_js`, written via the API:

```
PUT /v1/users/<id>   {"stylesheet": "..."}     # CSS injected into <head>
PUT /v1/users/<id>   {"custom_js": "..."}      # JS injected as <script type="module" nonce=...>
```

This repo packages the two customizations I run on my own Miniflux instance, with a reusable injection script. No credentials are included — bring your own.

## Contents

```
themes/
  catppuccin-latte.css     Catppuccin Latte theme (vendored from catppuccin/miniflux@main)
  grouping.css             CSS for the client-side /feeds & /unread grouping (this repo, MIT)
combined/
  latte+grouping.css       = catppuccin-latte.css + grouping.css, ready to inject as-is
js/
  group_list.js            Client-side script: groups /feeds and /unread by category, collapsible
apply/
  inject.sh                Reusable per-user injection script (curl + python3, no jq needed)
```

## Customizations

### 1. Catppuccin Latte theme (light)

`themes/catppuccin-latte.css` is a byte-for-byte vendored copy of [catppuccin/miniflux](https://github.com/catppuccin/miniflux) `themes/catppuccin-latte.css` from the `main` branch. All credit to the Catppuccin project (MIT). It overrides Miniflux's CSS variables on top of the built-in `light_serif` base theme.

Other Catppuccin variants (Frappe, Macchiato, Mocha) are available upstream — swap the file if you prefer a darker palette.

### 2. `/feeds` + `/unread` category grouping (client-side JS + CSS)

Miniflux's `/feeds` (subscription list) and `/unread` (unread entries) pages are **flat by default** — categories show only as small per-item tags, not as section headers. This is a known product decision ([miniflux discussion #1783](https://github.com/orgs/miniflux/discussions/1783), open for years, no env toggle).

`js/group_list.js` is a per-user `custom_js` script that rebuilds both pages client-side into collapsible, category-grouped sections:

| Page | Behavior |
|---|---|
| `/feeds` | Bold section headers (`1.05rem`), per-category unread total extracted from feed counters |
| `/unread` | Low-key uppercase headers (`.75rem`, `meta` color), per-category count = items on current page |
| Both | Click header (or Enter/Space when focused) to collapse; state persisted in `localStorage` |

Implementation notes:
- Articles are **moved** (not cloned) into category `<section>`s — form/button/swipe handlers and `data-id` are preserved.
- Sort order: by count descending, then by original appearance.
- CSP: Miniflux sets `require-trusted-types-for: 'script'`, so the script uses only DOM APIs (`createElement` / `appendChild` / `textContent` / `setAttribute` / `addEventListener`) — **no `innerHTML`**.
- The chevron in CSS uses the literal `▾` (U+25BE) character — do not replace with `\u25BE` in CSS `content`, it won't render.

## Prerequisites

- A running Miniflux instance (tested against `miniflux/miniflux:latest`).
- `curl` and `python3` on the machine running `inject.sh`.
- Target user's `id` (numeric). The first admin is `1`; check via `GET /v1/me` (Basic Auth) → JSON `id` field.
- The user's base theme in Miniflux UI settings should be `light_serif` (default) for the Catppuccin Latte palette to layer correctly.

## Apply (one-time per user)

```bash
export MF_URL=http://localhost:8080
export MF_USER=you@example.com
export MF_PASS=your_password
export MF_USER_ID=1

# Inject stylesheet (theme + grouping CSS together)
./apply/inject.sh css combined/latte+grouping.css

# Inject grouping script
./apply/inject.sh js js/group_list.js
```

Expected output: `PUT .../v1/users/1 -> HTTP 201`.

Open Miniflux, refresh `/feeds` and `/unread` — sections should appear and collapse on click.

## Reset

```bash
./apply/inject.sh reset-css     # revert to Miniflux default styling
./apply/inject.sh reset-js      # remove grouping script
```

## Upgrade / maintenance

- **Upstream Catppuccin updates**: re-pull `themes/catppuccin-latte.css` from `catppuccin/miniflux@main`, then rebuild `combined/` and re-inject.
- **Miniflux version bumps**: if the `/feeds` or `/unread` DOM structure changes (class names, counter format, `span.category` location), `group_list.js` may stop matching. The script targets `article.feed-item` / `article.entry-item` and `span.category a` — re-check those selectors in the new templates and adjust if needed. Re-run `./apply/inject.sh js js/group_list.js` after editing.
- **New Miniflux users**: customization is per-user — re-run both `inject.sh` commands for each new user id.

## Compatibility

Verified working on `miniflux/miniflux:latest` as of July 2026. The customizations are layout/DOM-dependent; future Miniflux releases may require selector updates.

## License

- `themes/catppuccin-latte.css` — MIT, © Catppuccin organization (vendored from [catppuccin/miniflux](https://github.com/catppuccin/miniflux)).
- Everything else in this repo — MIT, © kiFte.

See `LICENSE`.
