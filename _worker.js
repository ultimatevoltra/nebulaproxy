// ============================================================================
// NebulaProxy — general-purpose rotating proxy on Cloudflare Workers (Flaregun)
// ----------------------------------------------------------------------------
// A single, self-contained streaming proxy. One instance forwards ANY
// http/https target (text, JSON, images, video) with the body/headers/status
// preserved and the upstream body STREAMED (never buffered), so large video and
// image binaries pass through without hitting Worker memory/time limits.
//
// ROTATION: a fleet of these workers (deployed via Flaregun) each egress from a
// different Cloudflare IP. Flaregun rotates requests across the fleet, dodging
// per-IP rate limits (e.g. Pollinations FREE_LIMIT). Rotation strategy is
// configurable via FLAREGUN_STRATEGY env.
//
// Public API (unchanged):
//   GET/POST/PUT  /api/proxy?url=<target>&mode=json   -> fetch & return target
//   GET           /api/health                         -> { status:"ok" }
//   GET           /api/version                        -> { version, engine }
// ============================================================================

const DEFAULT_TIMEOUT_MS = 60_000; // hard 60s cap

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

// Headers we forward upstream (UA, Accept, Referer, Authorization, Cookie,
// Content-Type, Range …). Request/connection/host headers are intentionally
// excluded — Cloudflare sets those itself.
const FORWARD_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "accept-encoding",
  "user-agent",
  "referer",
  "origin",
  "authorization",
  "cookie",
  "content-type",
  "range",
  "if-range",
  "if-modified-since",
  "if-none-match",
  "x-requested-with",
];

// Headers we echo back from upstream (content-type, length, range, cache, …).
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "content-encoding",
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "etag",
  "last-modified",
  "expires",
  "pragma",
  "access-control-expose-headers",
];

// ---------------------------------------------------------------------------
// SSRF / URL validation — block internal & link-local targets.
// ---------------------------------------------------------------------------
const BLOCKED_HOSTS = [
  "localhost",
  "localhost.",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "[::1]",
];

function isBlockedHost(hostname) {
  const h = (hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (BLOCKED_HOSTS.includes(h)) return true;
  // IPv4 ranges: 10/8, 172.16/12, 192.168/16, 169.254/16
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const parts = h.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 127) return true;
  }
  return false;
}

function isBlockedIPv6(hostname) {
  const h = (hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  // fc00::/7 and ::1
  return /^fc/i.test(h) || h === "::1" || h === "0:0:0:0:0:0:0:1";
}

function validateTarget(raw) {
  const s = String(raw || "").trim();
  if (!s) return { error: "missing 'url' parameter" };
  let u;
  try {
    u = new URL(s);
  } catch {
    return { error: "invalid URL" };
  }
  if (!/^https?:$/.test(u.protocol)) {
    return { error: "only http/https URLs are allowed" };
  }
  const hostname = u.hostname;
  if (isBlockedHost(hostname) || isBlockedIPv6(hostname)) {
    return { error: "blocked target (private/local address)" };
  }
  return { url: u };
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// Rotation strategy (Flaregun-style). When a fleet is deployed, each worker's
// env carries FLAREGUN_STRATEGY; a tiny weighted jitter avoids thundering-herd
// and spreads load. The SDK/CLI performs real rotation across worker instances.
// ---------------------------------------------------------------------------
function strategyJitter(env) {
  const strategy = (env.FLAREGUN_STRATEGY || "adaptive").toLowerCase();
  // A deterministic-ish per-worker jitter used only to thin retry storms.
  return strategy === "round-robin" ? 0 : Math.floor(Math.random() * (strategy === "random" ? 40 : 15));
}

async function proxyRequest(request, env, targetUrl) {
  const method = request.method.toUpperCase();

  const upstream = new Request(targetUrl.href, {
    method: method === "GET" || method === "POST" || method === "PUT" ? method : "GET",
    headers: buildUpstreamHeaders(request, targetUrl),
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
    redirect: "follow",
  });

  const jitter = strategyJitter(env);
  if (jitter > 0) await new Promise((r) => setTimeout(r, jitter));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(upstream, { signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && e.name === "AbortError";
    return jsonError(aborted ? "upstream timed out (60s)" : "upstream fetch failed", 504);
  }
  clearTimeout(timer);

  return buildProxyResponse(res);
}

function buildUpstreamHeaders(request, targetUrl) {
  const headers = new Headers();
  const ua = request.headers.get("user-agent") ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
  for (const name of FORWARD_REQUEST_HEADERS) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }
  if (!headers.has("user-agent")) headers.set("user-agent", ua);
  headers.set("accept", request.headers.get("accept") || "*/*");
  if (request.headers.get("range")) headers.set("range", request.headers.get("range"));
  return headers;
}

function buildProxyResponse(upstream) {
  const headers = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) headers.set(name, v);
  }
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);

  // Stream the upstream body back as-is (no buffering) so large video/image
  // binaries flow through memory-efficiently.
  const body = upstream.body;
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

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
      return new Response(
        JSON.stringify({ status: "ok", engine: "flaregun-rotating-proxy", timestamp: new Date().toISOString() }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    if (pathname === "/api/version") {
      return new Response(
        JSON.stringify({ version: "2.0.0", name: "nebulaproxy", engine: "flaregun-rotating-proxy" }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    if (pathname === "/api/proxy") {
      const targetRaw = url.searchParams.get("url") || "";
      const mode = (url.searchParams.get("mode") || "auto").toLowerCase();

      const { url: targetUrl, error } = validateTarget(targetRaw);
      if (error) return jsonError(error, 400);

      // mode=json wraps the result as JSON metadata + body (text targets only)
      if (mode === "json") {
        const res = await proxyRequest(request, env, targetUrl);
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("json") || contentType.includes("text")) {
          const text = await res.text();
          return new Response(
            JSON.stringify({ ok: true, status: res.status, data: text, proxy_worker: env.WORKER_ID || null }),
            { status: res.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
          );
        }
        // binary target with mode=json -> stream it through untouched
        return res;
      }

      // auto / text / stream: forward verbatim (streamed)
      return proxyRequest(request, env, targetUrl);
    }

    return jsonError("not found", 404);
  },
};
