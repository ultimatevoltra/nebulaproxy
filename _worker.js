// ============================================================================
// VortexProxy — Cloudflare Worker
// Serves the static UI AND hides the real backend by forwarding /api/* server-side.
// The upstream URL lives ONLY here (as a secret) — never exposed to the browser.
// ============================================================================

// Point this at your real rotating proxy backend. Set via:
//   wrangler secret put UPSTREAM_URL
// or change the fallback below. It must be a full https:// origin.
const UPSTREAM = "https://your-backend.example.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
};

export default {
  async fetch(request, env) {
    const upstream = env.UPSTREAM_URL || UPSTREAM;
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: CORS });
      }
      try {
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
            "X-Vortex-Forwarded": "1",
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
