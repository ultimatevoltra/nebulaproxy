// ============================================================================
// NebulaProxy — general-purpose rotating proxy on Cloudflare Workers (Flaregun)
// ----------------------------------------------------------------------------
// A self-contained streaming proxy. Forwards ANY http/https target (text, JSON,
// images, VIDEO) with body/headers/status preserved and the upstream body
// STREAMED (never buffered), so large binaries pass through without memory hit.
//
// IP ROTATION + COOLDOWN (Pollinations FREE_LIMIT dodging):
//   Cloudflare Workers egress from a fixed per-colo IP, so a SINGLE worker
//   cannot rotate its own egress IP per request. Rotation is achieved with a
//   FLEET of workers (deployed via Flaregun: `flaregun up 20`), each in a
//   different Cloudflare colo = different egress IP. This worker reads
//   FLEET_URLS (comma-separated sibling worker /api/proxy URLs) and, when an
//   upstream rate limit is detected (HTTP 402/429 or a FREE_LIMIT body), fans
//   the request out to the next non-cooling-down sibling (a different IP),
//   honouring IP_COOLDOWN_SECONDS per worker so we never hammer one upstream IP.
//
//   NOTE: true per-request rotation from within a single Worker is NOT possible
//   on Cloudflare's free plan — Flaregun's own SDK/CLI rotates on the CLIENT
//   side by picking a different worker URL. The fleet fan-out below is the
//   best server-side approximation and yields genuinely different egress IPs.
//
// Public API (unchanged):
//   GET/POST/PUT  /api/proxy?url=<target>&mode=json   -> fetch & return target
//   GET           /api/health                         -> { status:"ok", fleet:N }
//   GET           /api/version                        -> { version, engine }
//   GET           /  (and any non-/api/* path)        -> landing page (200)
// ============================================================================

const DEFAULT_TIMEOUT_MS = 60_000; // hard 60s cap

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

const FORWARD_REQUEST_HEADERS = [
  "accept", "accept-language", "user-agent", "referer", "origin",
  "authorization", "cookie", "content-type", "range", "if-range",
  "if-modified-since", "if-none-match", "x-requested-with",
];

const FORWARD_RESPONSE_HEADERS = [
  "content-type", "content-length", "content-range", "content-encoding",
  "accept-ranges", "cache-control", "content-disposition", "etag",
  "last-modified", "expires", "pragma", "access-control-expose-headers",
];

// ---------------------------------------------------------------------------
// SSRF / URL validation
// ---------------------------------------------------------------------------
const BLOCKED_HOSTS = ["localhost", "localhost.", "127.0.0.1", "::1", "0.0.0.0", "[::1]"];

function isBlockedHost(hostname) {
  const h = (hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (BLOCKED_HOSTS.includes(h)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const p = h.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 0) return true;
    if (p[0] === 127) return true;
  }
  return false;
}

function isBlockedIPv6(hostname) {
  const h = (hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return /^fc/i.test(h) || h === "::1" || h === "0:0:0:0:0:0:0:1";
}

function validateTarget(raw) {
  const s = String(raw || "").trim();
  if (!s) return { error: "missing 'url' parameter" };
  let u;
  try { u = new URL(s); } catch { return { error: "invalid URL" }; }
  if (!/^https?:$/.test(u.protocol)) return { error: "only http/https URLs are allowed" };
  if (isBlockedHost(u.hostname) || isBlockedIPv6(u.hostname))
    return { error: "blocked target (private/local address)" };
  return { url: u };
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// Fleet IP rotation + cooldown
// ---------------------------------------------------------------------------
// FLEET_URLS: comma-separated sibling worker URLs (each a different egress IP).
// We maintain a cooldown map (worker URL -> next-allowed timestamp) in memory.
const _cooldown = new Map();

function parseFleet(env) {
  const raw = (env.FLEET_URLS || "").trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function cooldownSeconds(env) {
  const n = parseInt(env.IP_COOLDOWN_SECONDS || "300", 10);
  return Number.isFinite(n) && n >= 0 ? n : 300;
}

// Pick the next fleet worker that is NOT in cooldown.
function nextFleetWorker(env, excludeSelf = true) {
  const fleet = parseFleet(env);
  if (fleet.length === 0) return null;
  const now = Date.now();
  const cd = cooldownSeconds(env) * 1000;
  for (const w of fleet) {
    if (excludeSelf && w.includes(new URL(w).hostname)) continue; // avoid self-loop
    const until = _cooldown.get(w) || 0;
    if (now >= until) return w;
  }
  // all cooling down -> return the soonest one anyway
  fleet.sort((a, b) => (_cooldown.get(a) || 0) - (_cooldown.get(b) || 0));
  return fleet[0];
}

function markCooldown(env, workerUrl) {
  if (!workerUrl) return;
  _cooldown.set(workerUrl, Date.now() + cooldownSeconds(env) * 1000);
}

// Detect a Pollinations-style FREE_LIMIT / rate-limit response body.
function isRateLimit(res, bytes) {
  if (res.status === 402 || res.status === 429) return true;
  if (!bytes) return false;
  try {
    const j = JSON.parse(bytes);
    if (j && j.error && (j.error.code === "FREE_LIMIT" || /rate|limit/i.test(j.error.code || ""))) return true;
  } catch {}
  return false;
}

// ---------------------------------------------------------------------------
// Proxy core
// ---------------------------------------------------------------------------
function buildUpstreamHeaders(request, targetUrl) {
  const headers = new Headers();
  const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  for (const name of FORWARD_REQUEST_HEADERS) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }
  // Always send a browser User-Agent — some backends (Pollinations) reject
  // non-browser UAs (e.g. python-httpx) with "error code: 1042".
  const ua = request.headers.get("user-agent") || "";
  if (!ua || /python|curl|wget|go-http|node-fetch|axios|postman/i.test(ua)) {
    headers.set("user-agent", BROWSER_UA);
  }
  // A browser-like Accept is REQUIRED by some image backends (Pollinations
  // returns "error code: 1042" for a bare */* accept header).
  const clientAccept = request.headers.get("accept");
  headers.set(
    "accept",
    clientAccept && clientAccept !== "*/*"
      ? clientAccept
      : "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
  );
  // Do NOT forward Accept-Encoding so the response is not gzip-distorted when
  // we need to inspect bytes; Cloudflare re-compresses as needed.
  headers.delete("accept-encoding");
  return headers;
}

function buildProxyResponse(upstream) {
  const headers = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) headers.set(name, v);
  }
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

// Fetch the target through THIS worker (one egress IP). Returns {res, bytes}
// where bytes is the buffered body ONLY when it's a likely rate-limit (small
// JSON) response; otherwise bytes is null and the body is streamed.
async function fetchOnce(request, targetUrl, timeoutMs) {
  const method = request.method.toUpperCase();
  const upstream = new Request(targetUrl.href, {
    method: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"].includes(method) ? method : "GET",
    headers: buildUpstreamHeaders(request, targetUrl),
    body: ["GET", "HEAD"].includes(method) ? undefined : request.body,
    redirect: "follow",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(upstream, { signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && e.name === "AbortError";
    return { res: null, bytes: null, aborted };
  }
  clearTimeout(timer);

  // Peek at small JSON error bodies so we can detect FREE_LIMIT and rotate.
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const isJson = ct.includes("json");
  let bytes = null;
  if (isJson || res.status === 402 || res.status === 429) {
    try {
      bytes = await res.arrayBuffer();
      // re-create a streamable response from the buffered bytes
      res = new Response(bytes, { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch {}
  }
  return { res, bytes: bytes ? new TextDecoder().decode(bytes) : null };
}

async function proxyRequest(request, env, targetUrl) {
  const timeoutMs = DEFAULT_TIMEOUT_MS;

  // Attempt 1: through this worker.
  let { res, bytes } = await fetchOnce(request, targetUrl, timeoutMs);
  if (!res) {
    return jsonError("upstream fetch failed", 504);
  }

  // If rate-limited, fan out to a sibling worker (different egress IP) once.
  let attempts = 1;
  const maxAttempts = 1 + (parseFleet(env).length > 0 ? 1 : 0);
  while (isRateLimit(res, bytes) && attempts < maxAttempts) {
    const sibling = nextFleetWorker(env);
    if (!sibling) break;
    const siblingUrl = new URL(sibling);
    const qp = siblingUrl.searchParams;
    qp.set("url", targetUrl.href);
    // mark this sibling as used (cooldown) so we don't retry on the same IP
    markCooldown(env, sibling);
    attempts++;
    try {
      const r2 = await fetch(siblingUrl.toString(), {
        method: request.method,
        headers: { "user-agent": request.headers.get("user-agent") || "flaregun-fleet" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      return buildProxyResponse(r2);
    } catch {
      // sibling failed -> fall through to the (possibly rate-limited) original
    }
  }

  // Expose which worker/IP served this request for observability.
  if (res.status === 402 || res.status === 429) {
    const hdr = new Headers(res.headers);
    hdr.set("X-Rate-Limited", "1");
    hdr.set("Retry-After", String(cooldownSeconds(env)));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: hdr });
  }
  return buildProxyResponse(res);
}

// ---------------------------------------------------------------------------
// Landing page (200) for root + non-/api/* paths
// ---------------------------------------------------------------------------
const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NebulaProxy — Rotating Proxy Gateway</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
         background: radial-gradient(1200px 600px at 20% -10%, #1e1b4b 0%, #0b0a14 55%, #05040a 100%);
         color: #e5e7eb; min-height: 100vh; display: grid; place-items: center; }
  .card { max-width: 640px; padding: 48px 40px; text-align: center; }
  h1 { font-size: 2.4rem; margin: 0 0 8px; background: linear-gradient(90deg,#a78bfa,#f472b6,#38bdf8);
       -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .sub { color: #94a3b8; font-size: 1.05rem; margin: 0 0 32px; }
  .endpoints { text-align: left; background: #0f172a; border: 1px solid #1e293b; border-radius: 12px;
               padding: 20px 24px; margin: 0 auto; max-width: 480px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #7dd3fc; font-size: 0.9rem; }
  .endpoints div { padding: 6px 0; border-bottom: 1px dashed #1e293b; }
  .endpoints div:last-child { border-bottom: 0; }
  .badge { display: inline-block; background: #312e81; color: #c7d2fe; padding: 2px 10px; border-radius: 999px;
           font-size: 0.8rem; margin: 0 4px; }
  a { color: #a78bfa; }
</style>
</head>
<body>
<div class="card">
  <h1>NebulaProxy</h1>
  <p class="sub">Rotating-exit proxy gateway on Cloudflare Workers</p>
  <div class="endpoints">
    <div><span class="badge">GET/POST</span> <code>/api/proxy?url=&lt;target&gt;</code></div>
    <div><span class="badge">GET</span> <code>/api/health</code></div>
    <div><span class="badge">GET</span> <code>/api/version</code></div>
  </div>
  <p style="margin-top:24px;color:#64748b">Streams text, JSON, images &amp; video · CORS enabled · SSRF-safe</p>
</div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (pathname === "/api/health") {
      const fleet = parseFleet(env);
      return new Response(
        JSON.stringify({ status: "ok", engine: "flaregun-rotating-proxy", fleet: fleet.length,
          cooldown_seconds: cooldownSeconds(env), timestamp: new Date().toISOString() }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    if (pathname === "/api/version") {
      return new Response(
        JSON.stringify({ version: "3.0.0", name: "nebulaproxy", engine: "flaregun-rotating-proxy",
          rotation: "fleet-fanout-with-cooldown" }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    if (pathname === "/api/proxy") {
      const targetRaw = url.searchParams.get("url") || "";
      const mode = (url.searchParams.get("mode") || "auto").toLowerCase();
      const { url: targetUrl, error } = validateTarget(targetRaw);
      if (error) return jsonError(error, 400);

      if (mode === "json") {
        const res = await proxyRequest(request, env, targetUrl);
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("json") || contentType.includes("text")) {
          const text = await res.text();
          return new Response(
            JSON.stringify({ ok: true, status: res.status, data: text, via_fleet: !!parseFleet(env).length }),
            { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }
        return res;
      }

      return proxyRequest(request, env, targetUrl);
    }

    // Root + any other non-/api/* path -> landing page (200).
    // Serve the static assets if bundled (public/index.html), else inline LANDING.
    if (env.ASSETS) {
      try {
        const asset = await env.ASSETS.fetch(request);
        if (asset && asset.status === 200) return asset;
      } catch {}
    }
    return new Response(LANDING_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS },
    });
  },
};
