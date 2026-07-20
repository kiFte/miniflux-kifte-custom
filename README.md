# miniflux-kifte-custom

[English](README.md) | [简体中文](README.zh-CN.md)

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

### 3. `/unread` sort-direction toggle (client-side JS, bundled in `group_list.js`)

Miniflux's `/unread` server sort is `user.EntryDirection` (`asc` = older first, `desc` = newer first). There is no URL query override on the `/unread` route — the only official switches are the per-user settings dropdown and the API. Out of the box Miniflux ships with `asc`, so unread entries pile up oldest-on-top, which is the opposite of what most readers expect.

`group_list.js` adds a small arrow button to the `/unread` page-header nav (next to "mark page as read" / "mark all as read"):

| Button | Direction | Meaning |
|---|---|---|
| `↓` | `desc` (default on first visit) | newest first |
| `↑` | `asc` | oldest first |

Behavior:

- Default on first visit (no localStorage yet) is `desc` — matches the "newest on top" intuition.
- Click flips direction, persists to `localStorage['miniflux:unread:sort-dir']`, and reorders article DOM nodes inside every category group on the current page in place. Articles are moved (not cloned), so all form/button/swipe handlers and `data-id` survive.
- Sort key is each article's `<time datetime="...">` ISO timestamp from Miniflux's `item_meta.html` template. Stable sort: ties keep original order.
- `/feeds` is untouched — the toggle only appears on `/unread`.
- CSP: same DOM-only API constraint as the grouping code, no `innerHTML`.

**Known boundary — multi-page inconsistency.** The toggle reorders only the articles already on the current page. If unread count exceeds `EntriesPerPage` (default 100), flipping to `asc` makes each page internally oldest-first but does not repaginate across the whole unread set. To keep server-side pagination aligned with the default `desc`, run once:

```bash
./apply/inject.sh entry-direction desc
```

This sets `entry_sorting_direction=desc` on the user via `PUT /v1/users/<id>`, so the server also returns newest-first by default. With this in place, the common case (no toggle click, or staying on `desc`) is consistent across pages; only an explicit `asc` toggle exposes the boundary.

## Prerequisites

- A running Miniflux instance (tested against `miniflux/miniflux:latest`).
- `curl` and `python3` on the machine running `inject.sh`.
- Target user's `id` (numeric). The first admin is `1`; check via `GET /v1/me` (Basic Auth) → JSON `id` field.
- The user's base theme in Miniflux UI settings should be `light_serif` (default) for the Catppuccin Latte palette to layer correctly.

## Apply via AI agent (recommended)

You shouldn't be hand-editing env vars and running curl yourself. Hand this prompt to your AI assistant (Claude Code, Codex, Cursor, opencode, etc.) — it will read the repo, call the Miniflux API, and apply everything. Fill in the four values in angle brackets first:

```
Deploy the Miniflux customizations from this repo to my Miniflux instance.

- Miniflux URL: <http://localhost:8080 or your instance>
- Admin username: <you@example.com>
- Admin password: <your password>
- Target user ID: <1, or "discover via GET /v1/me">

Read README.md and apply/inject.sh in this repo to understand the injection
flow, then run the three apply steps: stylesheet (combined/latte+grouping.css),
custom_js (js/group_list.js), and entry-direction desc. Report each PUT's HTTP
status and summarize what changed. Use inject.sh via bash + curl; fall back to
direct curl PUT against /v1/users/<id> only if inject.sh errors.
```

The agent does the rest. Manual path below if you insist.

## Apply manually (fallback)

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

Optional one-off: align server-side `/unread` sort with the client toggle's default (newest first):

```bash
./apply/inject.sh entry-direction desc
```

## Reset

```bash
./apply/inject.sh reset-css     # revert to Miniflux default styling
./apply/inject.sh reset-js      # remove grouping script
```

## Upgrade / maintenance

- **Upstream Catppuccin updates**: re-pull `themes/catppuccin-latte.css` from `catppuccin/miniflux@main`, then rebuild `combined/` and re-inject.
- **Miniflux version bumps**: if the `/feeds` or `/unread` DOM structure changes (class names, counter format, `span.category` location), `group_list.js` may stop matching. The script targets `article.feed-item` / `article.entry-item` and `span.category a` — re-check those selectors in the new templates and adjust if needed. Re-run `./apply/inject.sh js js/group_list.js` after editing.
- **Sort toggle selectors**: the `/unread` toggle additionally couples to `time[datetime]` (from `common/item_meta.html`) for the sort key and `.page-header nav ul` (from `views/unread_entries.html`) for button insertion. If either template changes, update `entryTime()` / `insertSortToggle()` in `js/group_list.js` accordingly.
- **New Miniflux users**: customization is per-user — re-run both `inject.sh` commands for each new user id.

## Compatibility

Verified working on `miniflux/miniflux:latest` as of July 2026. The customizations are layout/DOM-dependent; future Miniflux releases may require selector updates.

## License

- `themes/catppuccin-latte.css` — MIT, © Catppuccin organization (vendored from [catppuccin/miniflux](https://github.com/catppuccin/miniflux)).
- Everything else in this repo — MIT, © kiFte.

See `LICENSE`.
