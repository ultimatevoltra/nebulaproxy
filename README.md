# 🌪️ NebulaProxy — Serverless Edge Proxy Gateway

A fast, versatile edge proxy gateway running on **Cloudflare Workers** with the Ember-themed NebulaProxy web console. Requests egress from Cloudflare's global edge network (AS13335) using native `fetch()` — with zero external proxy dependencies, zero SOCKS5 overhead, and ultra-low latency.

> **What it is:** A production-ready, flexible fetch proxy supporting text, JSON, chunked Base64, and raw streaming responses. Ideal for CORS bypassing, scraping, media streaming, batch URL execution, and header forwarding.

---

## 🚀 Key Features

- **Optional API Key Authentication:** By default, public mode is enabled (no API key required). Set `API_TOKEN` in Cloudflare to lock down access instantly.
- **CORS Preflight & Bypass:** Seamlessly fetch third-party APIs from browser applications with proper OPTIONS handling and open CORS headers.
- **Request History:** Inspect your last 50 requests with execution latency, byte sizes, copy-to-cURL, and one-click re-run in the Playground.
- **Named Presets:** Save frequently used request configurations, export them as JSON, or import shared preset bundles.
- **Batch Processing:** Run lists of URLs sequentially with configurable delay intervals, progress bars, and CSV/JSON export.
- **Enhanced Response Viewer:** Switch between formatted **Preview** (with embedded images/video/audio players), **Raw Body**, and **Headers** inspector.
- **Dark / Light Theme Toggle:** Clean Ember dark palette by default with full light mode support and automatic system preference matching.
- **Keyboard Shortcuts:** Fast developer workflows with `Ctrl+Enter`, `Ctrl+K`, `Ctrl+H`, and `Ctrl+S`.
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
   - Use the **Test API Key** button to verify connectivity against `/api/health`.

---

## 🔐 Admin Login (Rate-Limited)

The Settings tab admin login is protected against brute-force attacks:

1. **Server-verified credentials:** set `ADMIN_USER` (default `admin`) and `ADMIN_PASSWORD` as Cloudflare Worker variables. If `ADMIN_PASSWORD` is unset/empty, admin login is disabled.
2. **2-minute lockout:** a single wrong username/password attempt locks the login form (and the client IP on the worker) for **2 minutes**, returning `429 Too Many Requests`.
3. **Client + server enforcement:** the browser stores the lock in `localStorage` (`nebula_admin_lock`) and the worker tracks failed attempts per IP, so clearing localStorage does not bypass protection.
   - `wrangler secret put ADMIN_PASSWORD` (and optionally `wrangler secret put ADMIN_USER`).

---

## ⚙️ Settings Reference

| Setting | Storage Key | Default | Description |
|---|---|---|---|
| **API Key** | `nebula_api_key` | *(empty)* | Optional Bearer token sent with every proxy request. Requires admin access to set. |
| **Default Timeout** | `nebula_timeout` | `30000` | Max milliseconds to wait before aborting (returns 504 Gateway Timeout). |
| **Default Mode** | `nebula_mode` | `auto` | Fallback mode when none is specified (`auto`, `text`, `json`, `base64`, `stream`). |
| **Follow Redirects** | `nebula_follow` | `true` | Automatically follow HTTP 3xx redirects up to 5 hops. |
| **Auto-save History** | `nebula_autohist` | `true` | Automatically append requests to the History tab. |
| **Max History Entries** | `nebula_maxhist` | `50` | Maximum requests retained in local history before trimming. |
| **Batch Delay** | `nebula_batchdelay` | `500` | Delay in milliseconds between consecutive batch URL requests. |
| **Theme** | `nebula_theme` | `system` | Dark or light theme preference. |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (or <kbd>⌘</kbd>+<kbd>Enter</kbd>) | Send request from the Playground |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> (or <kbd>⌘</kbd>+<kbd>K</kbd>) | Focus and select Target URL input |
| <kbd>Ctrl</kbd> + <kbd>H</kbd> (or <kbd>⌘</kbd>+<kbd>H</kbd>) | Open History tab |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> (or <kbd>⌘</kbd>+<kbd>S</kbd>) | Open Settings tab |

---

## 📡 API Endpoints

### 1. `ANY /api/proxy`
Proxy requests to any remote endpoint. Supports query parameters (GET) or a JSON body (POST/PUT/PATCH).

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

### 4. `POST /api/admin/login`
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
curl "https://your-worker.dev/api/proxy?url=https://api.ipify.org?format=json"
```

### cURL (With API Token)
```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  "https://your-worker.dev/api/proxy?url=https://api.ipify.org?format=json"
```

### POST Request with Custom Body & Headers
```bash
curl -X POST "https://your-worker.dev/api/proxy" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://httpbin.org/post",
    "method": "POST",
    "headers": { "X-Custom-Header": "Nebula" },
    "body": { "message": "Hello from Cloudflare Edge" }
  }'
```

### Video / Audio Streaming with Range Header
```bash
curl -i -H "Range: bytes=0-1048575" \
  "https://your-worker.dev/api/proxy?url=https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4&mode=stream"
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

## 📝 Changelog (v1.1.0)

- **Optional API Token:** Worker supports both unauthenticated public mode and token-secured mode based on `env.API_TOKEN`.
- **Admin-Gated Key Configuration:** Settings UI requires admin login to modify or clear the saved API key.
- **Request History:** Added History tab tracking up to 50 requests with latency, size, cURL export, and re-run.
- **Request Presets:** Save, delete, export, and import request configurations.
- **Batch Processing:** Run multi-URL sequential requests with delay control, real-time progress, and CSV/JSON export.
- **Response Viewer Tabs:** Added Preview, Raw Body, and Headers inspection tabs with download and copy actions.
- **Dark/Light Theme:** Added header theme toggle with system theme detection.
- **Keyboard Shortcuts:** Added `Ctrl+Enter`, `Ctrl+K`, `Ctrl+H`, `Ctrl+S`.
- **Admin Login Rate Limiting:** Added server-verified admin credentials (`ADMIN_USER` / `ADMIN_PASSWORD`) with a 2-minute lockout after a failed login attempt, enforced both server-side (per-IP) and client-side (per-browser).
- **Bug Fixes:**
  - Robust CORS preflight (OPTIONS) response.
  - Chunked ArrayBuffer-to-Base64 conversion preventing memory spikes.
  - AbortController timeout handling returning 504 Gateway Timeout.
  - Range header forwarding preserving 206 Partial Content.
  - HEAD requests returning headers without body.
  - Health (`/api/health`) and version (`/api/version`) endpoints added.
