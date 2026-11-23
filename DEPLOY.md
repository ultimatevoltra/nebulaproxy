# NebulaProxy — Deploy Guide

## What this is
A general-purpose streaming proxy on Cloudflare Workers. Forwards any http/https
target (text, JSON, images, video) with method/headers/status preserved and the
upstream body STREAMED. Includes SSRF protection, CORS, optional fleet fan-out
with per-IP cooldown, and a landing page for root + non-`/api/*` paths.

## API
- `GET/POST/PUT /api/proxy?url=<target>&mode=json` — fetch & return target
- `GET /api/health` — `{ status, engine, fleet, cooldown_seconds }`
- `GET /api/version`
- `GET /` and any non-`/api/*` path — landing page (200)

## Deploy
```sh
npm install
wrangler deploy                                   # deploys _worker.js + ./public assets
wrangler secret put FLEET_URLS                    # comma-separated sibling worker URLs
wrangler secret put IP_COOLDOWN_SECONDS           # optional (default 300)
```

Env (see `.dev.vars.example`):
- `CF_API_TOKEN`, `CF_ACCOUNT_ID` — for the Flaregun CLI
- `WORKER_COUNT`, `FLAREGUN_STRATEGY` — fleet settings
- `IP_COOLDOWN_SECONDS` — per-IP cooldown (default 300)
- `FLEET_URLS` — comma-separated sibling /api/proxy URLs (different egress IPs)

## IMPORTANT — IP rotation reality (free plan)
Cloudflare Workers egress from a **fixed per-colo IP**, so a single Worker
cannot rotate its own egress IP per request. Flaregun's own rotation is
**client-side**: the `flaregun` CLI / `FlareGun` SDK runs on YOUR machine and
picks a different worker URL per request.

However, on Cloudflare's free plan all workers in one account commonly land in
the SAME colo (same egress IPv6, e.g. `2a06:98c0:3600::103`), so firing across
a Flaregun fleet does NOT yield truly different egress IPs. Cloudflare's edge
DOES rotate the IPv4 pool naturally (172.64.x / 104.22.x / 172.70.x change per
request), but Pollinations keys its `FREE_LIMIT` (1 image / 45s) on the client
IP, so a shared colo still hits the limit.

### Best alternatives (in order)
1. **Respect `Retry-After` / cooldown** — the worker already does: on a 402/429
   FREE_LIMIT it tags `X-Rate-Limited` and waits `IP_COOLDOWN_SECONDS`. The
   bot client should also honour Pollinations' `Retry-After` (NebulaProxy bot
   does).
2. **Pollen API key** — a Pollinations key lifts the per-IP rate limit entirely.
3. **Proxium rotating exits** — the NebulaProxy Bot's `proxium_rotate()` mints
   a REAL `https://<ip>/__cpi.php?s=<token>` per call, each with a genuinely
   different egress IP (e.g. 51.38.134.54, 185.16.38.230). This is the only
   true per-request egress rotation available without a paid plan.

## Image proxy note
Pollinations (and some image backends) return `error code: 1042` for a bare
`Accept: */*` or non-browser User-Agent. The worker now always sends a
browser-like `Accept` + `User-Agent` upstream, which fixes the 1042 on fresh
requests (the remaining 1042s are the 45s/IP rate limit).
