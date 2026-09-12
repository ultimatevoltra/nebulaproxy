require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { ProxyPool } = require('./lib/proxyPool');
const { requireApiKey } = require('./middleware/auth');
const { createGateway } = require('./lib/gateway');
const authRoutes = require('./routes/auth');
const { buildAdminRouter } = require('./routes/admin');

const PORT = Number(process.env.PORT) || 3000;
const GATEWAY_PORT = Number(process.env.GATEWAY_PORT) || 8000;

const pool = new ProxyPool();
pool.startHealthLoop();
setInterval(() => pool.persistStats(), 15000);
setInterval(() => pool.cleanupSticky(), 60000);

let gatewayServer = null;
let gatewayStartedAt = null;

async function startGateway() {
  if (gatewayServer) return gatewayServer;
  gatewayServer = createGateway({
    pool,
    port: GATEWAY_PORT,
    gatewayUser: process.env.GATEWAY_USER,
    gatewayPass: process.env.GATEWAY_PASS,
    log: (msg, extra) => {
      if (process.env.VERBOSE === 'true') console.log('[gateway]', msg, extra || '');
    },
  });
  await gatewayServer.listen();
  gatewayStartedAt = new Date().toISOString();
  console.log(`✅ Rotating proxy gateway listening on port ${GATEWAY_PORT}`);
  return gatewayServer;
}

async function stopGateway() {
  if (!gatewayServer) return;
  await gatewayServer.close(true);
  gatewayServer = null;
  gatewayStartedAt = null;
  console.log('🛑 Rotating proxy gateway stopped');
}

async function restartGateway() {
  await stopGateway();
  await startGateway();
}

function getGatewayState() {
  return {
    running: !!gatewayServer,
    port: GATEWAY_PORT,
    startedAt: gatewayStartedAt,
    host: process.env.PUBLIC_HOST || 'YOUR_SERVER_IP',
    user: process.env.GATEWAY_USER,
  };
}

// ============ Web / API server ============
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });
app.use('/api', globalLimiter);

app.use('/api/auth', authRoutes);
app.use(
  '/api/admin',
  buildAdminRouter({ pool, getGatewayState, restartGateway, stopGateway, startGateway })
);

// Public status endpoint (no secrets)
app.get('/api/status', (req, res) => {
  const s = pool.summary();
  const accounts = (pool.settings.accounts || []).map((a) => ({
    id: a.id, label: a.label, plan: a.plan, proxies: a.proxies,
  }));
  res.json({
    status: 'ok',
    proxiesTotal: s.totalProxies,
    proxiesHealthy: s.healthy,
    rotationStrategy: s.rotationStrategy,
    gatewayRunning: !!gatewayServer,
    uptimeSec: process.uptime(),
    countries: s.countries,
    totalRequests: s.totalRequests,
    avgLatencyMs: s.avgLatencyMs,
    accounts,
    accountsTotal: accounts.length,
    startedAt: s.startedAt,
  });
});

// ============ Public Rotating Proxy API ============
// GET /api/proxy          -> one proxy (rotating, unique-IP cycle)
// GET /api/proxy?country=US -> one proxy from that country
// GET /api/proxy/list     -> all enabled proxies (no secrets)
// GET /api/proxy/countries-> geo summary
app.get('/api/proxy', (req, res, next) => {
  if (process.env.REQUIRE_API_KEY === 'true') return requireApiKey(req, res, next);
  next();
}, (req, res) => {
  const country = req.query.country;
  const p = pool.pickByCountry(country);
  if (!p) {
    return res.status(404).json({
      error: country
        ? `No enabled proxy available for country "${country}".`
        : 'No enabled proxies available.',
    });
  }
  res.json({
    ip: p.host,
    port: p.port,
    username: p.username,
    password: p.password,
    protocol: p.protocol || 'http',
    country: p.country || 'Unknown',
    countryCode: p.countryCode || 'UN',
    city: p.city || null,
    flag: p.flag || '',
    proxyUrl: `${p.protocol || 'http'}://${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@${p.host}:${p.port}`,
  });
});

app.get('/api/proxy/list', (req, res) => {
  const list = pool.getEnabled().map((p) => ({
    id: p.id,
    ip: p.host,
    port: p.port,
    protocol: p.protocol || 'http',
    country: p.country || 'Unknown',
    countryCode: p.countryCode || 'UN',
    city: p.city || null,
    flag: p.flag || '',
    health: p.health.status,
    latencyMs: p.health.latencyMs ?? null,
  }));
  res.json({ count: list.length, proxies: list });
});

app.get('/api/proxy/countries', (req, res) => {
  res.json({ countries: pool.countrySummary() });
});

// Tell clients how much is left of a quota, keep it simple: no-op
app.get('/api/proxy/credits', (req, res) => {
  res.json({ note: 'Unlimited — this is a self-hosted rotating gateway.' });
});

app.get('/health', (req, res) => res.json({ ok: true }));

// SPA fallback
app.get('/*splat', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🌐 Portal + Admin UI running at http://localhost:${PORT}`);
});

startGateway().catch((e) => console.error('Failed to start gateway:', e));

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown() {
  console.log('\nShutting down...');
  try { pool.persistStats(); } catch (e) { /* ignore */ }
  try { pool.persist(); } catch (e) { /* ignore */ }
  pool.stopHealthLoop();
  await stopGateway();
  process.exit(0);
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.message ? err.message : err);
});
