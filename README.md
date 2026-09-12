# 🛰️ NebulaProxy — Rotating Proxy Portal

**Design A — Deep Neon (previous design)**

A self-hosted rotating proxy gateway with a deep-space, neon-purple aurora portal — full landing page, real documentation, and a secure admin panel.

> **Version v1.0.0** (pinned)

---
### Professional design system (v1.0.0 redesign)
- Layered depth & refined typography (Inter + JetBrains Mono), a real type scale, and a single consistent motion vocabulary (ease-out / spring curves).
- Meaningful long-form content: value proposition, live architecture flow (Client → Gateway → Upstream Pool), real-time country coverage, and a working live rotation terminal.
- Micro-interactions throughout: entrance reveals, counter animations, card hover elevation, magnetic buttons, focus rings, and `prefers-reduced-motion` support.
- Full i18n (8 languages incl. RTL Arabic) with every string translated — no raw keys.

## What's inside

- **Rotating gateway** (`GATEWAY_PORT`, default `8000`) — a real HTTP/HTTPS proxy server (built on `proxy-chain`) that authenticates clients and forwards each request through one of your upstream proxies using a configurable rotation strategy.
- **Public web portal** (`PORT`, default `3000`) — animated aurora landing page, live rotation demo terminal, and full docs (`#/docs`) with cURL / Python / Node / Scrapy / Puppeteer examples.
- **Admin panel** (`#/admin`, JWT + bcrypt) — Overview KPIs, Proxy Pool CRUD + bulk import, real Settings page, Rotation strategy picker, System Control (start/stop/restart gateway, reset stats), Credentials view, Live request logs, and Deployment guide.
- **i18n** — English, বাংলা, हिन्दी, 中文, Español, Français, العربية (RTL), Русский.
- **Speed** — shared keep-alive agents pool upstream connections; background health-checker auto-quarantines dead nodes.

## Run locally

```bash
npm install
node server.js
# Portal:  http://localhost:3000
# Gateway: localhost:8000  (use GATEWAY_USER / GATEWAY_PASS from .env)
```

## Proxy pool

10 upstream IPs across 6 countries (UK ×3, US ×3, Spain, Poland, Japan, Germany). Two Webshare accounts are configured, but both resolve to the **same 10 exit IPs** (free-plan regional pool), so the second account adds concurrent connection budget rather than unique IPs.

## Deploy

See `#/admin/deploy`, the "Deployment" section in `#/docs`, and the bundled `DEPLOY_GUIDE.txt`, `DOMAIN_GUIDE.txt`, and `CLOUDFLARE_WORKERS_GUIDE.txt`.

---

## Changelog (v1.0.0)
- **UI/UX rebuild** — real content everywhere: animated landing, live rotation demo terminal, full docs (15 sections), functional Settings page, real admin data. No more placeholder/2-line stubs.
- **Fixed critical i18n bug** — English (default) previously rendered raw keys (`nav.home`, `hero.title`…) because no `en` entries existed in the dictionary. Now every string has a real English value.
- Enriched `/api/status` with accounts, request counts, and average latency.
- Added optional `REQUIRE_API_KEY=true` to gate the public `/api/proxy` API behind `X-API-Key`.
- Added account inventory to settings + admin panel.
- Deep neon aurora design (Design A).
