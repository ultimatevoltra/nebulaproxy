const express = require('express');
const { requireAuthOrApiKey } = require('../middleware/auth');

function buildAdminRouter(ctx) {
  const { pool, getGatewayState, restartGateway, stopGateway, startGateway } = ctx;
  const router = express.Router();
  router.use(requireAuthOrApiKey);

  // ---- Dashboard summary ----
  router.get('/summary', (req, res) => {
    res.json({ ...pool.summary(), gateway: getGatewayState() });
  });

  // ---- Proxies CRUD ----
  router.get('/proxies', (req, res) => {
    const safe = pool.list().map((p) => ({ ...p, password: p.password ? '••••••••' : '' }));
    res.json({ proxies: req.query.reveal === '1' ? pool.list() : safe });
  });

  router.post('/proxies', (req, res) => {
    const { label, host, port, username, password, protocol } = req.body || {};
    if (!host || !port) return res.status(400).json({ error: 'host and port are required' });
    const entry = pool.add({ label, host, port, username, password, protocol });
    res.json({ ok: true, proxy: entry });
  });

  router.post('/proxies/bulk', (req, res) => {
    // Accepts raw text lines "ip:port:user:pass" OR array of objects
    const { text, protocol } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    const lines = String(text)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const [host, port, username, password] = parts;
        parsed.push({ host, port: Number(port), username: username || '', password: password || '', protocol: protocol || 'http' });
      }
    }
    if (!parsed.length) return res.status(400).json({ error: 'No valid proxy lines found (expected ip:port:user:pass)' });
    const added = pool.bulkAdd(parsed);
    res.json({ ok: true, added: added.length, proxies: added });
  });

  router.patch('/proxies/:id', (req, res) => {
    const updated = pool.update(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Proxy not found' });
    res.json({ ok: true, proxy: updated });
  });

  router.delete('/proxies/:id', (req, res) => {
    const ok = pool.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Proxy not found' });
    res.json({ ok: true });
  });

  router.post('/proxies/:id/check', async (req, res) => {
    const p = pool.list().find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Proxy not found' });
    const result = await pool.healthCheckOne(p);
    pool.persist();
    res.json({ ok: true, result, proxy: p });
  });

  router.post('/proxies/check-all', async (req, res) => {
    await pool.healthCheckAll();
    res.json({ ok: true, proxies: pool.list() });
  });

  // ---- Settings / rotation strategy ----
  router.get('/settings', (req, res) => {
    res.json(pool.settings);
  });

  router.patch('/settings', (req, res) => {
    const VALID_STRATEGIES = ['round_robin', 'random', 'random_unique', 'least_used', 'best_latency', 'sticky'];
    const body = req.body || {};
    if (body.rotationStrategy && !VALID_STRATEGIES.includes(body.rotationStrategy)) {
      return res.status(400).json({ error: `Invalid rotationStrategy. Must be one of: ${VALID_STRATEGIES.join(', ')}` });
    }
    Object.assign(pool.settings, body);
    pool.persistSettings();
    res.json({ ok: true, settings: pool.settings });
  });

  // ---- System control (gateway server control) ----
  router.get('/system/gateway', (req, res) => {
    res.json(getGatewayState());
  });

  router.post('/system/gateway/start', async (req, res) => {
    try {
      await startGateway();
      res.json({ ok: true, state: getGatewayState() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/system/gateway/stop', async (req, res) => {
    try {
      await stopGateway();
      res.json({ ok: true, state: getGatewayState() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/system/gateway/restart', async (req, res) => {
    try {
      await restartGateway();
      res.json({ ok: true, state: getGatewayState() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---- Logs / stats ----
  router.get('/logs', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json({ logs: pool.stats.recentLogs.slice(-limit).reverse() });
  });

  router.get('/stats', (req, res) => {
    res.json({
      totals: {
        totalRequests: pool.stats.totalRequests,
        totalBytesIn: pool.stats.totalBytesIn,
        totalBytesOut: pool.stats.totalBytesOut,
        startedAt: pool.stats.startedAt,
      },
      perProxy: pool.stats.perProxy,
    });
  });

  router.post('/stats/reset', (req, res) => {
    pool.stats.totalRequests = 0;
    pool.stats.totalBytesIn = 0;
    pool.stats.totalBytesOut = 0;
    pool.stats.perProxy = {};
    pool.stats.recentLogs = [];
    pool.persistStats();
    res.json({ ok: true });
  });

  // ---- Credentials rotation (security control) ----
  router.get('/credentials', (req, res) => {
    res.json({
      adminUsername: process.env.ADMIN_USERNAME,
      gatewayUser: process.env.GATEWAY_USER,
      apiKeyMasked: process.env.API_KEY ? process.env.API_KEY.slice(0, 6) + '••••••' : null,
    });
  });

  return router;
}

module.exports = { buildAdminRouter };
