// ============================================================================
// NebulaProxy — Cloudflare Worker (Native Fetch Proxy Edition - v1.0.0)
// ----------------------------------------------------------------------------
// Serves the static UI (public/index.html) and provides a versatile edge proxy:
//   - GET  /api/health   -> Health check { status: "ok", version: "1.0.0" }
//   - GET  /api/version  -> Version info { version: "1.0.0", name: "nebulaproxy" }
//   - ANY  /api/proxy    -> Fetch target URL (GET query or POST body)
//                           Supports auto/text/json/base64/stream modes, Range
//                           forwarding, optional API_TOKEN protection, chunked b64.
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

const DEFAULT_TIMEOUT = 30000;

// Admin brute-force protection: lock an IP out for 2 minutes after a wrong
// username/password attempt. In-memory (resets on cold start); the client also
// enforces its own 2-minute lockout, so both layers apply.
const ADMIN_LOCKOUT_MS = 2 * 60 * 1000; // 2 minutes
const adminLoginFails = new Map(); // key -> { count, lockedUntil }

// Global request counters (in-memory; reset on cold start). Exposed via /api/stats.
const globalStats = { requests: 0, successes: 0, latencySum: 0 };


const BINARY_CONTENT_TYPES = [
  "image/",
  "video/",
  "audio/",
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "application/x-zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/gzip",
  "application/x-tar",
  "font/",
];

function isBinaryContentType(ct) {
  if (!ct) return false;
  const lower = ct.toLowerCase();
  return BINARY_CONTENT_TYPES.some((prefix) => lower.startsWith(prefix));
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

// Convert ArrayBuffer to base64 safely in chunks to prevent call-stack or memory blowup
function arrayBufferToBase64Chunked(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    let chunkStr = "";
    for (let j = 0; j < chunk.length; j++) {
      chunkStr += String.fromCharCode(chunk[j]);
    }
    binary += chunkStr;
  }
  return btoa(binary);
}

function logRequest(env, method, target, status, elapsed) {
  if (env.ENABLE_LOGGING === "true" || env.ENABLE_LOGGING === true) {
    console.log(`[NebulaProxy] ${method} ${target} -> ${status} (${elapsed}ms)`);
  }
}

// Resolve a client's IP for rate-limit keying (falls back to a constant).
function clientKey(request) {
  let ip = request.headers.get("CF-Connecting-IP") ||
           request.headers.get("X-Forwarded-For") ||
           request.headers.get("X-Real-IP") ||
           "unknown";
  return String(ip).split(",")[0].trim();
}

// Check whether a client is currently locked out of admin login.
function adminLoginLocked(ip) {
  const rec = adminLoginFails.get(ip);
  if (!rec) return 0;
  if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
    return rec.lockedUntil - Date.now();
  }
  if (rec.lockedUntil && rec.lockedUntil <= Date.now()) {
    adminLoginFails.delete(ip);
  }
  return 0;
}

function recordAdminLoginFail(ip) {
  adminLoginFails.set(ip, {
    count: 1,
    lockedUntil: Date.now() + ADMIN_LOCKOUT_MS,
  });
}

function clearAdminLoginFail(ip) {
  adminLoginFails.delete(ip);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight for all routes
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (pathname.startsWith("/api/")) {
      // 1. Health & Version endpoints
      if (pathname === "/api/health") {
        return jsonResponse({ status: "ok", version: "1.0.0", timestamp: new Date().toISOString() });
      }
      if (pathname === "/api/version") {
        return jsonResponse({ version: "1.0.0", name: "nebulaproxy", engine: "cloudflare-worker" });
      }

      // 1a. Global stats
      if (pathname === "/api/stats") {
        const avg = globalStats.requests > 0
          ? Math.round(globalStats.latencySum / globalStats.requests)
          : 0;
        return jsonResponse({
          status: "ok",
          requests: globalStats.requests,
          successes: globalStats.successes,
          success_rate: globalStats.requests > 0
            ? Math.round((globalStats.successes / globalStats.requests) * 100)
            : 0,
          avg_latency_ms: avg,
        });
      }

      // 1b. Admin login (with brute-force rate limiting)
      if (pathname === "/api/admin/login") {
        if (request.method !== "POST") {
          return jsonResponse({ error: "Method not allowed", code: 405 }, 405);
        }

        const ip = clientKey(request);
        const remainingLock = adminLoginLocked(ip);
        if (remainingLock > 0) {
          return jsonResponse(
            {
              error: "Too many failed attempts. Try again later.",
              code: 429,
              suggestion: "Rate limit exceeded. Slow down requests.",
              retry_after_ms: Math.ceil(remainingLock),
            },
            429
          );
        }

        const adminUser = (env.ADMIN_USER || "admin").trim();
        const adminPass = (env.ADMIN_PASSWORD || "").trim();

        let body = {};
        try {
          body = await request.json();
        } catch (_) {
          /* fall through; body stays {} */
        }
        const username = String(body.username || "").trim();
        const password = String(body.password || "");

        // If no admin password is configured, admin login is disabled.
        if (!adminPass) {
          return jsonResponse(
            {
              error: "Admin login is not configured. Set ADMIN_PASSWORD.",
              code: 403,
              suggestion: "Configure admin credentials via Worker environment variables.",
            },
            403
          );
        }

        const ok = username === adminUser && password === adminPass;
        if (ok) {
          clearAdminLoginFail(ip);
          const session = crypto.randomUUID();
          return jsonResponse({
            ok: true,
            user: adminUser,
            session,
            expires_in_ms: 0, // client persists session in localStorage
          });
        }

        recordAdminLoginFail(ip);
        logRequest(env, "POST", "/api/admin/login", 401, 0);
        return jsonResponse(
          {
            error: "Invalid username or password.",
            code: 401,
            suggestion: "Login locked for 2 minutes after a failed attempt.",
            retry_after_ms: ADMIN_LOCKOUT_MS,
          },
          401
        );
      }

      // 2. Main Proxy endpoint
      if (pathname === "/api/proxy") {
        // --- Authentication (OPTIONAL: only enforced if env.API_TOKEN is set) ---
        const configuredToken = (env.API_TOKEN || "").trim();
        if (configuredToken.length > 0) {
          const authHeader = request.headers.get("Authorization") || "";
          const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
          const queryToken = (url.searchParams.get("token") || "").trim();

          if (bearer !== configuredToken && queryToken !== configuredToken) {
            return jsonResponse(
              {
                error: "Unauthorized: Invalid or missing API token",
                code: 401,
                suggestion: "API key required or invalid. Check Settings.",
              },
              401
            );
          }
        }

        // --- Parameter parsing (GET query params or POST body) ---
        let params = {};
        for (const key of [
          "url", "method", "headers", "body", "body_b64", "mode",
          "timeout", "follow_redirects", "cookies", "filename",
        ]) {
          const v = url.searchParams.get(key);
          if (v !== null) params[key] = v;
        }

        if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
          const ct = request.headers.get("Content-Type") || "";
          if (ct.includes("application/json")) {
            try {
              const bodyJson = await request.json();
              if (bodyJson && typeof bodyJson === "object") {
                params = { ...params, ...bodyJson };
              }
            } catch (e) {
              return jsonResponse(
                {
                  error: "Invalid JSON in request body",
                  code: 400,
                  suggestion: "Ensure the POST body is valid JSON.",
                },
                400
              );
            }
          } else if (ct.includes("application/x-www-form-urlencoded")) {
            try {
              const form = await request.formData();
              for (const [k, v] of form.entries()) params[k] = v;
            } catch (e) {
              // ignore form parse error
            }
          } else {
            try {
              const raw = await request.text();
              if (raw.trim().startsWith("{") && raw.trim().endsWith("}")) {
                try { params = { ...params, ...JSON.parse(raw) }; } catch (_) {}
              }
            } catch (_) {}
          }
        }

        // Target URL validation. A target URL passed as a GET query value often
        // contains its own unencoded query string (e.g. ?url=https://x/y?a=1&b=2&c=3).
        // url.searchParams.get("url") truncates at the first '&', so we reconstruct
        // the full target from the raw query string, stopping at the first known
        // NebulaProxy control parameter.
        function extractTargetUrlFromQuery(searchString) {
          if (!searchString) return null;
          let s = searchString.startsWith("?") ? searchString.slice(1) : searchString;
          const idx = s.indexOf("url=");
          if (idx === -1) return null;
          let rest = s.slice(idx + 4); // everything after "url="
          const controlKeys = [
            "method", "mode", "headers", "body", "body_b64", "bodyIsBase64",
            "timeout", "follow_redirects", "cookies", "filename", "token",
          ];
          let cut = rest.length;
          for (const key of controlKeys) {
            const marker = "&" + key + "=";
            const pos = rest.indexOf(marker);
            if (pos !== -1 && pos < cut) cut = pos;
          }
          rest = rest.slice(0, cut);
          try {
            return decodeURIComponent(rest).trim();
          } catch (_) {
            return rest.trim();
          }
        }

        let targetUrlRaw;
        if (params.url && String(params.url).trim()) {
          targetUrlRaw = String(params.url).trim();
        } else {
          targetUrlRaw = extractTargetUrlFromQuery(url.search);
          if (!targetUrlRaw) targetUrlRaw = url.searchParams.get("url");
        }
        if (!targetUrlRaw || typeof targetUrlRaw !== "string" || !targetUrlRaw.trim()) {
          return jsonResponse(
            {
              error: "Missing 'url' parameter",
              code: 400,
              suggestion: "Provide a target URL via query string or body JSON.",
            },
            400
          );
        }

        let targetUrl;
        try {
          targetUrl = new URL(targetUrlRaw.trim()).toString();
        } catch (e) {
          return jsonResponse(
            {
              error: `Invalid URL format: ${targetUrlRaw}`,
              code: 400,
              suggestion: "Target must start with http:// or https:// and be a valid URL.",
            },
            400
          );
        }

        // Resolve method: explicit param > POST/PUT/PATCH default > GET (fixed precedence bug)
        let method = (params.method || "").toString().trim().toUpperCase();
        if (!method) {
          method = (request.method === "POST" || request.method === "PUT" || request.method === "PATCH")
            ? "POST"
            : "GET";
        }
        const mode = (params.mode || "auto").toLowerCase();
        const followRedirects = params.follow_redirects !== undefined
          ? (String(params.follow_redirects) !== "false" && params.follow_redirects !== false)
          : true;
        const timeout = parseInt(params.timeout, 10) > 0 ? parseInt(params.timeout, 10) : DEFAULT_TIMEOUT;

        // --- Build upstream headers ---
        const upstreamHeaders = new Headers();
        if (params.headers && typeof params.headers === "object") {
          for (const [k, v] of Object.entries(params.headers)) {
            if (v !== undefined && v !== null) upstreamHeaders.set(k, String(v));
          }
        }

        // Cookies
        if (params.cookies) {
          if (typeof params.cookies === "string") {
            upstreamHeaders.set("Cookie", params.cookies);
          } else if (typeof params.cookies === "object") {
            const pairs = Object.entries(params.cookies)
              .map(([k, v]) => `${k}=${v}`)
              .join("; ");
            if (pairs) upstreamHeaders.set("Cookie", pairs);
          }
        }

        // Range header forwarding for audio/video streaming & seek
        const clientRange = request.headers.get("Range");
        if (clientRange && !upstreamHeaders.has("Range")) {
          upstreamHeaders.set("Range", clientRange);
        }

        // Accept header default if absent
        if (!upstreamHeaders.has("Accept")) {
          upstreamHeaders.set("Accept", "*/*");
        }

        // --- Build upstream body ---
        let upstreamBody = undefined;
        if (method !== "GET" && method !== "HEAD") {
          if (params.body !== undefined && params.body !== null && params.body !== "") {
            if (params.body_b64 || params.bodyIsBase64) {
              try {
                const bin = atob(String(params.body));
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                upstreamBody = bytes;
              } catch (e) {
                return jsonResponse({ error: "Failed to decode base64 body", code: 400 }, 400);
              }
            } else if (typeof params.body === "string") {
              upstreamBody = params.body;
            } else {
              upstreamBody = JSON.stringify(params.body);
              if (!upstreamHeaders.has("Content-Type")) {
                upstreamHeaders.set("Content-Type", "application/json");
              }
            }
          }
        }

        // --- Upstream Fetch with Timeout (AbortController) ---
        const t0 = Date.now();
        let upstreamRes;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
          upstreamRes = await fetch(targetUrl, {
            method,
            headers: upstreamHeaders,
            body: upstreamBody,
            redirect: followRedirects ? "follow" : "manual",
            signal: controller.signal,
          });
          clearTimeout(timer);
        } catch (e) {
          clearTimeout(timer);
          const elapsed = Date.now() - t0;
          if (e && (e.name === "AbortError" || e.message?.includes("aborted"))) {
            logRequest(env, method, targetUrl, 504, elapsed);
            return jsonResponse(
              {
                error: `Gateway Timeout: target did not respond within ${timeout}ms`,
                code: 504,
                suggestion: "Request took too long. Try increasing timeout in Settings or check target server.",
                elapsed_ms: elapsed,
              },
              504
            );
          }
          logRequest(env, method, targetUrl, 502, elapsed);
          return jsonResponse(
            {
              error: `Target unreachable: ${e.message || String(e)}`,
              code: 502,
              suggestion: "Target unreachable. Check URL or try again.",
              elapsed_ms: elapsed,
            },
            502
          );
        }

        const elapsedMs = Date.now() - t0;
        const status = upstreamRes.status;
        const ct = upstreamRes.headers.get("content-type") || "";
        logRequest(env, method, targetUrl, status, elapsedMs);

        // Track global stats (in-memory)
        globalStats.requests++;
        globalStats.latencySum += elapsedMs;
        if (status >= 200 && status < 400) globalStats.successes++;

        // HEAD: Return headers only without body
        if (method === "HEAD") {
          const respHeaders = new Headers(upstreamRes.headers);
          Object.entries(CORS_HEADERS).forEach(([k, v]) => respHeaders.set(k, v));
          return new Response(null, {
            status,
            statusText: upstreamRes.statusText,
            headers: respHeaders,
          });
        }

        const forceStream = mode === "stream";
        const forceBase64 = mode === "base64";
        const forceText = mode === "text";
        const forceJson = mode === "json";
        const isBinary = isBinaryContentType(ct);

        // --- 1. Stream Mode OR Auto-detected Binary Stream ---
        if (forceStream || (isBinary && !forceBase64)) {
          const respHeaders = new Headers(upstreamRes.headers);
          Object.entries(CORS_HEADERS).forEach(([k, v]) => respHeaders.set(k, v));
          if (params.filename) {
            respHeaders.set("Content-Disposition", `attachment; filename="${params.filename}"`);
          }
          return new Response(upstreamRes.body, {
            status,
            statusText: upstreamRes.statusText,
            headers: respHeaders,
          });
        }

        // --- 2. Buffered (text/json/base64) ---
        const buf = await upstreamRes.arrayBuffer();
        const sizeBytes = buf.byteLength;
        const text = new TextDecoder().decode(buf);

        // Determine response data
        let data;
        let data_b64 = null;
        if (forceBase64) {
          data_b64 = arrayBufferToBase64Chunked(buf);
          data = null;
        } else {
          const responseHeadersObj = {};
          upstreamRes.headers.forEach((v, k) => { responseHeadersObj[k] = v; });
          const looksJson = (ct.includes("json") || (text.trim().startsWith("{") && text.trim().endsWith("}")));
          if (looksJson || forceJson) {
            try {
              data = JSON.parse(text);
            } catch (e) {
              data = text;
            }
          } else {
            data = text;
          }
          if (forceJson && typeof data !== "object") {
            data = { raw: text };
          }
          return jsonResponse(
            {
              status,
              statusText: upstreamRes.statusText,
              data,
              data_b64,
              content_type: ct,
              headers: responseHeadersObj,
              proxy_host: "cloudflare-edge",
              attempt: 1,
              elapsed_ms: elapsedMs,
              size_bytes: sizeBytes,
            },
            status
          );
        }

        return jsonResponse(
          {
            status,
            statusText: upstreamRes.statusText,
            data,
            data_b64,
            content_type: ct,
            headers: {},
            proxy_host: "cloudflare-edge",
            attempt: 1,
            elapsed_ms: elapsedMs,
            size_bytes: sizeBytes,
          },
          status
        );
      }

      return jsonResponse({ error: "Endpoint not found", code: 404 }, 404);
    }

    // Static assets (UI)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
