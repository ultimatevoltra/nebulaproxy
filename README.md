# 🌪️ VortexProxy

A rotating proxy API gateway — a fresh egress IP on every request, wrapped in a clean single-file web console.

Dark-red "Ember" design system · custom brand · live request playground · full API docs · 7 languages (English, বাংলা, हिन्दी, Español, Français, العربية, Русский).

## The API

| Endpoint | Description |
|---|---|
| `POST /api/proxy` | Rotate IP and fetch a target URL |
| `GET /api/proxy/ip` | Get the current egress IP |

The upstream provider and gateway internals are never exposed to clients — responses only return `status / data / headers`.

## Structure

- `index.html` — the full site (UI + CSS + JS + i18n), fully self-contained.
- `_worker.js` — Cloudflare Worker: serves the UI and forwards `/api/*` to your backend server-side, hiding the real URL.
- `wrangler.jsonc` — Worker config (assets + worker entry).

## Deploy

```bash
npm install -g wrangler
wrangler deploy
wrangler secret put UPSTREAM_URL
```

Or import into the Cloudflare dashboard and paste the files — no extra settings needed.
