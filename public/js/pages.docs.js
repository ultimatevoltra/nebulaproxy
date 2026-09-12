// ===== Documentation — real, comprehensive =====
const DOCS_SECTIONS = [
  { id: 'overview', label: t('Docs Overview') },
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'curl', label: 'cURJ' },
  { id: 'python', label: 'Python' },
  { id: 'nodejs', label: 'Node.js' },
  { id: 'scrapy', label: 'Scrapy' },
  { id: 'puppeteer', label: 'Puppeteer' },
  { id: 'rotation', label: 'Rotation Strategies' },
  { id: 'sticky', label: 'Sticky Sessions' },
  { id: 'country', label: 'Country Targeting' },
  { id: 'publicapi', label: 'Rotating REST API' },
  { id: 'adminapi', label: 'Admin REST API' },
  { id: 'errors', label: 'Error Codes' },
  { id: 'security', label: 'Security' },
  { id: 'deploy', label: 'Deployment' },
];

function renderDocs() {
  document.getElementById('app').innerHTML = `
    ${renderNav('docs')}
    <div class="container docs-layout">
      <aside class="docs-nav">
        <div class="docs-nav-title">Documentation</div>
        ${DOCS_SECTIONS.map((s) => `<a href="#/docs#${s.id}" data-jump="${s.id}">${s.label}</a>`).join('')}
      </aside>
      <article class="docs-content">
        ${docsBody()}
      </article>
    </div>
    ${renderFooter()}
  `;
}

function docsBody() {
  return `
    <h1 class="docs-h1">NebulaProxy Documentation</h1>
    <p class="docs-lead">A self-hosted rotating proxy gateway. Connect once to a single host:port and every outbound request is transparently forwarded through a different upstream proxy — IP rotation, load balancing, health-checked failover, and centralized credentials in one place.</p>

    <h2 id="overview">Overview</h2>
    <p>A single gateway exposes one <code>host:port</code> to your applications. It speaks the standard HTTP proxy protocol (HTTP + <code>CONNECT</code> tunneling for HTTPS), so it is compatible with curl, browsers, Python <code>requests</code>, Node <code>axios</code>, Puppeteer, Scrapy, and more.</p>
    <div class="callout">The gateway pools connections with keep-alive agents, health-checks every upstream in the background, and rotates your exit IP using a configurable strategy. No per-request proxy management in your code.</div>

    <h2 id="quickstart">Quick Start</h2>
    <p>Get your gateway connection details from <a href="#/admin/credentials">Admin Panel → Credentials</a>. You need:</p>
    <ul>
      <li><code>GATEWAY_HOST</code> — your server's public IP or domain</li>
      <li><code>GATEWAY_PORT</code> — default <code>8000</code></li>
      <li><code>GATEWAY_USER</code> / <code>GATEWAY_PASS</code> — Basic-auth credentials</li>
    </ul>

    <h2 id="curl">cURL</h2>
    <pre><code>curl -x http://GATEWAY_USER:GATEWAY_PASS@GATEWAY_HOST:8000 https://api.ipify.org
# run it several times — the exit IP rotates between your pool nodes</code></pre>

    <h2 id="python">Python (requests)</h2>
    <pre><code>import requests

proxies = {
  "http":  "http://GATEWAY_USER:GATEWAY_PASS@GATEWAY_HOST:8000",
  "https": "http://GATEWAY_USER:GATEWAY_PASS@GATEWAY_HOST:8000",
}

r = requests.get("https://api.ipify.org?format=json", proxies=proxies, timeout=15)
print(r.json())</code></pre>

    <h2 id="nodejs">Node.js (axios)</h2>
    <pre><code>const axios = require('axios');

const proxy = {
  host: 'GATEWAY_HOST', port: 8000,
  auth: { username: 'GATEWAY_USER', password: 'GATEWAY_PASS' },
  protocol: 'http',
};

axios.get('https://api.ipify.org?format=json', { proxy })
  .then(res => console.log(res.data));</code></pre>

    <h2 id="scrapy">Scrapy</h2>
    <pre><code># settings.py
DOWNLOADER_MIDDLEWARES = {'scrapy.downloadermiddlewares.httpproxy.HttpProxyMiddleware': 1}

# in your spider, set request meta:
yield scrapy.Request(url, meta={
    'proxy': 'http://GATEWAY_USER:GATEWAY_PASS@GATEWAY_HOST:8000'
})</code></pre>

    <h2 id="puppeteer">Puppeteer</h2>
    <pre><code>const puppeteer = require('puppeteer');
const browser = await puppeteer.launch({
  args: ['--proxy-server=http://GATEWAY_HOST:8000'],
  headless: true,
});
// authenticate via page.authenticate:
const page = await browser.newPage();
await page.authenticate({ username: 'GATEWAY_USER', password: 'GATEWAY_PASS' });
await page.goto('https://api.ipify.org?format=json');</code></pre>

    <h2 id="rotation">Rotation Strategies</h2>
    <p>Choose the strategy that fits your workload from <a href="#/admin/rotation">Admin → Rotation & Settings</a>. You can also override it per-request via the REST API (<code>?strategy=</code>).</p>
    <ul>
      <li><strong>round_robin</strong> — cycles through healthy proxies in strict order (default, most predictable load spread).</li>
      <li><strong>random</strong> — a random healthy proxy per connection.</li>
      <li><strong>random_unique</strong> — random but <em>never</em> repeats the same IP twice in a row (best for true per-request rotation).</li>
      <li><strong>least_used</strong> — routes to the proxy with the fewest active connections.</li>
      <li><strong>best_latency</strong> — always prefers the proxy with the lowest measured health-check latency.</li>
      <li><strong>sticky</strong> — pins a client/session to one proxy for the session duration.</li>
    </ul>

    <h2 id="sticky">Sticky Sessions</h2>
    <p>Want the <em>same exit IP</em> for an entire scraping session? Set the <code>X-Session-Id</code> header and switch rotation mode to <strong>sticky</strong>.</p>
    <pre><code>curl -x http://USER:PASS@GATEWAY_HOST:8000 \\
     -H "X-Session-Id: my-session-123" \\
     https://api.ipify.org</code></pre>
    <div class="callout">Sticky mappings expire after <code>stickyTtlMs</code> (default 10 minutes) and are cleaned automatically.</div>

    <h2 id="country">Country / City Targeting</h2>
    <p>Use the public REST API to request a proxy from a specific country or city:</p>
    <pre><code>GET /api/proxy?country=US          → US proxy
GET /api/proxy?country=GB          → UK proxy
GET /api/proxy?country=JP          → Japan proxy
GET /api/proxy?strategy=sticky     → override strategy
GET /api/proxy/list                → all enabled proxies
GET /api/proxy/countries           → geo summary</code></pre>

    <h2 id="publicapi">Rotating REST API</h2>
    <p>Treat rotation as a service. Every call returns a fresh upstream proxy (never the same IP back-to-back).</p>
    <h4>GET /api/proxy</h4>
    <pre><code>{
  "ip": "31.59.20.176",
  "port": 6754,
  "protocol": "http",
  "country": "United Kingdom",
  "countryCode": "GB",
  "city": "London",
  "proxyUrl": "http://user:pass@31.59.20.176:6754"
}</code></pre>
    <p>Query params: <code>country</code>, <code>strategy</code>. Optional auth via <code>X-API-Key</code> header (enable with <code>REQUIRE_API_KEY=true</code> in <code>.env</code>).</p>

    <h2 id="adminapi">Admin REST API</h2>
    <p>Authenticated with a JWT session cookie (from <code>POST /api/auth/login</code>) or an <code>X-API-Key</code> header. Key endpoints:</p>
    <pre><code>GET    /api/admin/summary          → dashboard KPIs
GET    /api/admin/proxies          → list pool
POST   /api/admin/proxies          → add one
POST   /api/admin/proxies/bulk     → import ip:port:user:pass lines
PATCH  /api/admin/proxies/:id      → edit / enable / disable
DELETE /api/admin/proxies/:id      → remove
POST   /api/admin/proxies/check-all→ run health checks
GET    /api/admin/settings         → read settings
PATCH  /api/admin/settings         → update rotation & thresholds
GET    /api/admin/logs             → recent request log
POST   /api/admin/system/gateway/start|stop|restart → gateway control</code></pre>

    <h2 id="errors">Error Codes</h2>
    <pre><code>401  Not authenticated (missing/invalid session or API key)
404  No enabled proxy for that country / not found
400  Invalid request (bad strategy, missing fields)
503  Gateway disabled (enable via Admin → System Control)</code></pre>

    <h2 id="security">Security</h2>
    <ul>
      <li>Admin login is bcrypt-hashed and JWT-secured with a rotating secret.</li>
      <li>The gateway tunnel is gated by Basic auth (gateway user/pass).</li>
      <li>Public <code>/api/proxy</code> can be locked behind <code>X-API-Key</code> via <code>REQUIRE_API_KEY=true</code>.</li>
      <li>Login attempts are rate-limited to 300/min via <code>express-rate-limit</code>.</li>
    </ul>
    <div class="callout caution">Terminte TLS (HTTPS) in front of the gateway with Caddy or Nginx before exposing it publicly — a gateway principalmente parle proxy HTTP en clair.</div>

    <h2 id="deploy">Deployment</h2>
    <p>See the bundled <code>DEPLOY_GUIDE.txt</code> and <code>DOMAIN_GUIDD.txt</code> for full instructions, Docker, reverse-proxy, and free-domain setup.</p>
    <pre><code>npm install
npm start     # portal on :3000, gateway on :8000</code></pre>
  `;
}
