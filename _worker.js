// ============================================================================
// NebulaProxy — Cloudflare Worker (jsonbin auto-sync version)
// Serves the static UI AND hides the real backend by forwarding /api/* server-side.
// The backend URL is resolved LIVE from a jsonbin.io bin that tunnel.py keeps
// updated — so when the Quick tunnel restarts and gets a new URL, the website
// keeps working automatically (no manual re-deploy needed).
// ============================================================================

// jsonbin.io bin id (public read). tunnel.py PUTs the current URL here.
const JSONBIN_BIN = "6aae4b01ac6210605adf2988";
const JSONBIN_URL = "https://api.jsonbin.io/v3/b/" + JSONBIN_BIN + "/latest";

// Fallback if jsonbin is unreachable (last known good URL).
const FALLBACK_UPSTREAM = "https://flu-demand-poly-appointment.trycloudflare.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
};

let _cache = { url: null, ts: 0 };
const CACHE_TTL = 30 * 1000; // 30s

async function resolveUpstream(env) {
  if (env.UPSTREAM_URL) return env.UPSTREAM_URL;

  const bin = env.JSONBIN_BIN || JSONBIN_BIN;
  const binUrl = bin
    ? "https://api.jsonbin.io/v3/b/" + bin + "/latest"
    : (env.JSONBIN_URL || JSONBIN_URL);

  if (!bin && !env.JSONBIN_URL) return FALLBACK_UPSTREAM;

  if (_cache.url && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.url;
  }

  try {
    const res = await fetch(binUrl, {
      headers: { "User-Agent": "nebulaproxy-worker" },
    });
    if (!res.ok) throw new Error("jsonbin status " + res.status);
    const data = await res.json();
    const url = (data && data.record && (data.record.url || data.record.upstream)) || null;
    if (!url || typeof url !== "string" || !/^https?:\/\//.test(url)) {
      throw new Error("bad url in bin");
    }
    _cache = { url, ts: Date.now() };
    return url;
  } catch (err) {
    return _cache.url || FALLBACK_UPSTREAM;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: CORS });
      }
      try {
        const upstream = await resolveUpstream(env);
        const target = upstream.replace(/\/$/, "") + pathname + url.search;
        const method = request.method;
        let body = null;
        if (method !== "GET" && method !== "HEAD") {
          body = await request.arrayBuffer();
        }

        const upstreamRes = await fetch(target, {
          method,
          headers: {
            "Content-Type": request.headers.get("Content-Type") || "application/json",
            "User-Agent": request.headers.get("User-Agent") || "",
            "X-Nebula-Forwarded": "1",
          },
          body: method !== "GET" && method !== "HEAD" ? body : undefined,
        });

        const resp = new Response(upstreamRes.body, {
          status: upstreamRes.status,
          statusText: upstreamRes.statusText,
        });

        ["content-type", "set-cookie", "cache-control", "content-length"].forEach((h) => {
          const v = upstreamRes.headers.get(h);
          if (v) resp.headers.set(h, v);
        });
        Object.entries(CORS).forEach(([k, v]) => resp.headers.set(k, v));

        return resp;
      } catch (err) {
        return new Response(
          JSON.stringify({
            success: false,
            error_type: "gateway_error",
            details: String(err && err.message ? err.message : err),
          }),
          { status: 502, headers: { "Content-Type": "application/json", ...CORS } }
        );
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404, headers: CORS });
  },
};
