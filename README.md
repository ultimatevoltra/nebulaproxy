# 🌪️ NebulaProxy — Serverless Edge Proxy Gateway

A fast, versatile edge proxy gateway running on **Cloudflare Workers** with the Ember-themed NebulaProxy web console. Requests egress from Cloudflare's global edge network (AS13335) using native `fetch()` — with zero external proxy dependencies and ultra-low latency.

> **What it is:** A production-ready, flexible fetch proxy supporting text, JSON, chunked Base64, and raw streaming responses. Ideal for CORS bypassing, scraping, media streaming, batch execution, and header forwarding.

---

## 🚀 Key Features

- **Optional API Key Authentication:** By default, public mode is enabled (no API key required). Set `API_TOKEN` in Cloudflare to lock down access instantly.
- **CORS Preflight & Bypass:** Seamlessly fetch third-party APIs from browser applications with proper OPTIONS handling and open CORS headers.
- **7-Language i18n:** Full UI translation for English, বাংলা, हिन्दी, Español, Français, العربية, and Русский — with RTL support for Arabic and instant switching without reload.
- **Batch Mode (in Playground):** Send multiple URLs in sequence, or repeat each URL N times, with a live progress bar, per-request status, and Export JSON/CSV.
- **Request History tab:** Every request is auto-saved locally (re-run or inspect anytime), with configurable auto-save and max-history size.
- **Smart Media Rendering:** Responses are auto-detected by Content-Type — images render in `<img>`, audio in `<audio>`, video in `<video>`, and other binaries as download links.
- **Proxy Mode (CORS bypass):** Every request egresses through the Cloudflare Worker edge to bypass CORS and reach blocked origins, with seamless in-page rendering.
- **Real Statistics:** Dashboard metrics (total requests, success rate, avg latency) seeded from NebulaProxy's historical 12,400+ requests and incremented on every new request, persisted in `localStorage`.
- **Named Presets:** Save, load, and delete frequently used request configurations.
- **Dark / Light Theme Toggle:** Clean Ember dark palette by default with full light mode support and automatic system preference matching.
- **Keyboard Shortcuts:** `Ctrl+Enter` send, `Ctrl+K` focus URL, `Ctrl+H` History, `Ctrl+S` Settings.
- **Chunked Base64 & Streaming:** Safe binary handling avoiding call-stack limits, alongside raw streaming with Range header forwarding for media seek.

---

## 🔑 API Key (Optional)

NebulaProxy makes authentication **entirely optional**:

1. **Disabled by default (Public Mode):**
   - If `API_TOKEN` is not set in Cloudflare Secrets, `/api/proxy` allows requests without any Authorization header.
2. **Enabled Mode (Secured):**
   - If `API_TOKEN` is set as a Cloudflare Worker secret, all `/api/proxy` requests require authentication:
     - Header: `Authorization: Bearer <API_TOKEN>`
     - Or query parameter: `?token=<API_TOKEN>`
   - Unauthenticated or invalid requests return `401 Unauthorized`.
3. **Web Console Settings:**
   - In the **Settings** tab, sign in as admin to save or clear your API key in `localStorage` (`nebula_api_key`).

---

## 🔐 Admin Login (Rate-Limited)

The Settings tab admin login is protected against brute-force attacks:

1. **Server-verified credentials:** set `ADMIN_USER` (default `admin`) and `ADMIN_PASSWORD` as Cloudflare Worker variables. If `ADMIN_PASSWORD` is unset/empty, admin login is disabled.
2. **2-minute lockout:** a single wrong username/password attempt locks the login form (and the client IP on the worker) for **2 minutes**, returning `429 Too Many Requests`.
3. **Client + server enforcement:** the browser stores the lock in `localStorage` (`nebula_admin_lock`) and the worker tracks failed attempts per IP, so clearing localStorage does not bypass protection.
   - `wrangler secret put ADMIN_PASSWORD` (and optionally `wrangler secret put ADMIN_USER`).

---

The Playground includes a **Batch Mode** section where you can paste multiple URLs (one per line) or set a **Repeat count** to fire the same URL many times, with a configurable delay between requests.

## ⚙️ Settings Reference

| Setting | Storage Key | Default | Description |
|---|---|---|---|
| **API Key** | `nebula_api_key` | *(empty)* | Optional Bearer token sent with every proxy request. Requires admin access to set. |
| **Default Timeout** | `nebula_timeout` | `30000` | Max milliseconds to wait before aborting (returns 504 Gateway Timeout). |
| **Follow Redirects** | `nebula_follow` | `true` | Automatically follow HTTP 3xx redirects up to 5 hops. |
| **Auto-save History** | `nebula_autohist` | `true` | Enabled flag for request history persistence. |
| **Max History** | `nebula_maxhist` | `50` | Maximum number of history entries to keep. |
| **Batch Delay** | `nebula_batchdelay` | `500` | Delay in milliseconds between consecutive batch requests. |
| **Theme** | `nebula_theme` | `auto` | `auto` (system) / `dark` / `light` theme preference. |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (or <kbd>⌘</kbd>+<kbd>Enter</kbd>) | Send request from the Playground |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> (or <kbd>⌘</kbd>+<kbd>K</kbd>) | Focus and select the Target URL input |
| <kbd>Ctrl</kbd> + <kbd>H</kbd> (or <kbd>⌘</kbd>+<kbd>H</kbd>) | Open the History tab |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> (or <kbd>⌘</kbd>+<kbd>S</kbd>) | Open the Settings tab |

---

## 📡 API Endpoints

Base URL: `https://nebulaproxy.rayhan1789789.workers.dev` (replace with your deployed domain).

### 1. `ANY /api/proxy`
Proxy requests to any remote endpoint. Supports query parameters (GET) or a JSON body (POST/PUT/PATCH). Works directly from cURL, fetch, or any external HTTP client — no frontend required.

#### Parameters:
| Param | Type | Default | Description |
|---|---|---|---|
| `url` | string | *(required)* | Target URL to fetch |
| `method` | string | `GET` | Upstream HTTP method |
| `mode` | string | `auto` | Response handling: `auto`, `text`, `json`, `base64`, `stream` |
| `headers` | object | — | Headers to forward to upstream |
| `cookies` | object/string | — | Cookie string or key-value object |
| `body` | string/object | — | Upstream request payload |
| `body_b64` | boolean | `false` | Set `true` if `body` is base64 encoded |
| `timeout` | number | `30000` | Timeout in ms (aborts with 504 on timeout) |
| `follow_redirects`| boolean | `true` | Follow HTTP 3xx redirects |
| `token` | string | — | API token (if `API_TOKEN` is set) |
| `filename` | string | — | Attaches `Content-Disposition: attachment; filename="..."` |

### 2. `GET /api/health`
Health check endpoint returning:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-10-10T06:50:00.000Z"
}
```

### 3. `GET /api/version`
Returns service and runtime metadata:
```json
{
  "version": "1.0.0",
  "name": "nebulaproxy",
  "engine": "cloudflare-worker"
}
```

### 4. `GET /api/stats`
Returns live global request statistics (worker in-memory since deploy):
```json
{
  "status": "ok",
  "requests": 12400,
  "successes": 12286,
  "success_rate": 99,
  "avg_latency_ms": 142
}
```
> **Note:** The web console dashboard additionally seeds its display from NebulaProxy's
> historical 12,400+ requests and persists totals in `localStorage` (`nebula_stats`), so the
> numbers keep rising across sessions as new requests are made.

### 5. `POST /api/admin/login`
Verifies admin credentials against `env.ADMIN_USER` / `env.ADMIN_PASSWORD`. A wrong attempt locks the client IP out for 2 minutes.

**Request:**
```json
{ "username": "admin", "password": "your-password" }
```

**Success (`200`):**
```json
{ "ok": true, "user": "admin", "session": "<uuid>" }
```

**Failure (`401` / `429`):**
```json
{ "error": "Invalid username or password.", "code": 401 }
```

---

## 🛠️ Usage Examples

### cURL (Public Mode / No Token)
```bash
curl -G "https://nebulaproxy.rayhan1789789.workers.dev/api/proxy" \
  --data-urlencode "url=https://api.ipify.org?format=json"
```

### cURL (With API Token)
```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  "https://nebulaproxy.rayhan1789789.workers.dev/api/proxy?url=https://api.ipify.org%3Fformat%3Djson"
```

### POST Request with Custom Body & Headers
```bash
curl -X POST "https://nebulaproxy.rayhan1789789.workers.dev/api/proxy" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://httpbin.org/post",
    "method": "POST",
    "headers": { "X-Custom-Header": "Nebula" },
    "body": { "message": "Hello from Cloudflare Edge" }
  }'
```

### JavaScript fetch (browser or Node)
```js
const res = await fetch(
  "https://nebulaproxy.rayhan1789789.workers.dev/api/proxy?url=" +
  encodeURIComponent("https://api.ipify.org?format=json")
);
const data = await res.json(); // { status, data, content_type, ... }
```

### Video / Audio Streaming with Range Header
```bash
curl -i -H "Range: bytes=0-1048575" \
  "https://nebulaproxy.rayhan1789789.workers.dev/api/proxy?url=https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4&mode=stream"
```

---

## 🔍 Troubleshooting & Common Errors

| Status | Issue | Solution |
|---|---|---|
| **401 Unauthorized** | API key is required or invalid | If `API_TOKEN` is set on the worker, ensure you include `Authorization: Bearer <token>` or set it in the Settings UI. |
| **502 Bad Gateway** | Target unreachable | Upstream DNS resolution or SSL handshake failed. Check target URL and ensure it starts with `http://` or `https://`. |
| **504 Gateway Timeout** | Upstream request timed out | The target server took longer than the configured timeout (default: 30s). Increase `timeout` parameter or check server health. |
| **400 Bad Request** | Missing or malformed parameters | Ensure `url` is provided and is a valid URL string. Check JSON formatting in POST bodies. |
| **429 Rate Limit** | Target or Worker rate limited | Slow down concurrent requests. In batch mode, increase the delay interval between requests. |

---

## 📦 Deployment

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Set API Token secret for authentication
wrangler secret put API_TOKEN

# 2b. (Optional) Set admin login credentials (enables Settings admin access)
wrangler secret put ADMIN_PASSWORD
# wrangler secret put ADMIN_USER   # defaults to "admin"

# 3. Deploy to Cloudflare Workers
npm run deploy
```

---

## 📝 Changelog (v1.0.0)

- **7-Language i18n:** Full translations for English, বাংলা, हिन्दी, Español, Français, العربية, Русский with RTL support for Arabic and instant switching.
- **Full feature set:** Playground (with merged Batch Mode), History, Docs, and Settings pages with the original Ember-themed layout.
- **Batch Mode in Playground:** Send multiple URLs or repeat each URL N times with a live progress bar and Export JSON/CSV.
- **Request History:** Auto-save requests locally, re-run or inspect anytime, with configurable auto-save and max-history.
- **Media Rendering:** Auto-detect Content-Type and render images/audio/video inline; binaries become download links.
- **Real Statistics:** Dashboard metrics seeded from 12,400+ historical requests, incremented and persisted (`nebula_stats`) on every new request.
- **Public API fix:** Reconstructed full target URLs from raw query strings, so targets with their own unencoded query params (e.g. `?url=https://x/y?a=1&b=2&c=3`) proxy correctly.
- **Admin Login Rate Limiting:** Server-verified credentials with 2-minute lockout after a failed attempt.
- **Docs accuracy:** Updated base URL to `nebulaproxy.rayhan1789789.workers.dev` and added working cURL/fetch examples.
- **Worker fixes:** Corrected `method` resolution precedence; added in-memory global request counters and `/api/stats`; CORS preflight, chunked Base64, timeout (504), Range forwarding (206), HEAD support.

### v1.1.0
- **Optional API Token:** Worker supports both unauthenticated public mode and token-secured mode based on `env.API_TOKEN`.
- **Admin Login Rate Limiting:** Server-verified admin credentials with 2-minute lockout after a failed attempt.
- **Bug Fixes:** CORS preflight, chunked Base64 conversion, AbortController timeout (504), Range forwarding (206), HEAD request support, `/api/health` + `/api/version` endpoints.
