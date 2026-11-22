# NebulaProxy — Flaregun rotating proxy: deploy guide

## What changed
`_worker.js` was rewritten from the old fetch-proxy into a single self-contained
**general-purpose rotating proxy**:

- Streams the upstream body (no buffering) → large **images & video** pass through.
- Preserves upstream **status + headers** (Content-Type, Content-Length,
  Content-Range, Cache-Control, Accept-Ranges, ETag, …).
- Forwards **method (GET/POST/PUT), query, body and headers** (UA, Accept,
  Referer, Authorization, Cookie, Content-Type, Range).
- **CORS** on everything, **60s timeout**, JSON errors on failure.
- **SSRF guard** on `?url=`: http/https only; blocks `localhost`, `127.0.0.1`,
  `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`.
- **No manual per-IP cooldown** — rotation is handled by the Flaregun fleet
  (adaptive by default; random / round-robin via env).

Public API unchanged: `?url=<target>&mode=json` still works.

## 1. Prerequisites

```bash
npm install                # pulls wrangler + @miclivs/flaregun
```

## 2. Flaregun fleet setup

```bash
# one-time: store Cloudflare credentials (saved to ~/.flaregun/config.json)
npx flaregun init --token "$CF_API_TOKEN" --account "$CF_ACCOUNT_ID"

# deploy N rotating proxy workers (N = WORKER_COUNT, default 20)
npx flaregun up 20

# verify
npx flaregun ls
```

> `flaregun up N` deploys N identical proxy workers, each egressing from a
> different Cloudflare IP. `flaregun serve` / the `FlareGun.fetch()` SDK rotates
> requests across them (adaptive backoff on 429/5xx).

## 3. Deploy the main worker

The custom `_worker.js` (this repo) is the worker that fronts your public URL:

```bash
npx wrangler deploy                 # uses wrangler.toml
```

Set secrets (never commit real tokens):

```bash
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put CF_ACCOUNT_ID
```

## 4. Env reference

| Var | Default | Purpose |
| --- | --- | --- |
| `CF_API_TOKEN` | — | Cloudflare API token (Flaregun CLI) |
| `CF_ACCOUNT_ID` | — | Cloudflare account id |
| `WORKER_COUNT` | 20 | Fleet size |
| `FLAREGUN_STRATEGY` | adaptive | adaptive / round-robin / random |

## 5. Smoke test

```bash
curl "https://<your-worker>/api/health"
curl "https://<your-worker>/api/proxy?url=https://example.com"
curl "https://<your-worker>/api/proxy?url=https://httpbin.org/image/png" -o pic.png  # binary stream
curl "https://<your-worker>/api/proxy?url=https://example.com&mode=json"
```
