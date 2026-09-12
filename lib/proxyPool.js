const axios = require('axios');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');

const CHECK_URL = 'https://api.ipify.org?format=json';
const HEALTH_TIMEOUT_MS = 9000;
const MAX_CONSEC_FAILS = 3;

// Shared keep-alive agents => connection pooling/reuse => big speed boost
// when many client requests reuse the same upstream proxy connection.
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 64, timeout: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 64, timeout: 30000 });

class ProxyPool {
  constructor() {
    this.reload();
    this.rrCursor = 0;
    this.lastPickedId = null;
    this.stickyMap = new Map();
    this.stats = readJson('stats', {
      totalRequests: 0,
      totalBytesIn: 0,
      totalBytesOut: 0,
      startedAt: new Date().toISOString(),
      perProxy: {},
      recentLogs: [],
    });
    this.settings = readJson('settings', {
      rotationStrategy: 'round_robin',
      healthCheckIntervalSec: 120,
      stickyTtlMs: 10 * 60 * 1000,
      maxConsecFails: MAX_CONSEC_FAILS,
      gatewayEnabled: true,
    });
    this.activeConns = new Map();
  }

  reload() {
    const db = readJson('proxies', { proxies: [] });
    this.proxies = db.proxies || [];
    for (const p of this.proxies) {
      if (p.health === undefined) {
        p.health = { status: 'unknown', latencyMs: null, lastCheck: null, consecFails: 0, totalChecks: 0, totalOk: 0 };
      }
    }
    return this.proxies;
  }

  persist() {
    writeJson('proxies', { proxies: this.proxies });
  }

  persistStats() {
    this.stats.recentLogs = this.stats.recentLogs.slice(-200);
    writeJson('stats', this.stats);
  }

  persistSettings() {
    writeJson('settings', this.settings);
  }

  list() {
    return this.proxies;
  }

  getEnabled() {
    return this.proxies.filter((p) => p.enabled && p.health.status !== 'dead');
  }

  add(proxy) {
    const id = 'p_' + crypto.randomBytes(5).toString('hex');
    const entry = {
      id,
      label: proxy.label || id,
      host: proxy.host,
      port: Number(proxy.port),
      username: proxy.username || '',
      password: proxy.password || '',
      protocol: proxy.protocol || 'http',
      enabled: true,
      addedAt: new Date().toISOString(),
      health: { status: 'unknown', latencyMs: null, lastCheck: null, consecFails: 0, totalChecks: 0, totalOk: 0 },
    };
    this.proxies.push(entry);
    this.persist();
    return entry;
  }

  bulkAdd(list) {
    return list.map((p) => this.add(p));
  }

  update(id, patch) {
    const p = this.proxies.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, patch);
    this.persist();
    return p;
  }

  remove(id) {
    const before = this.proxies.length;
    this.proxies = this.proxies.filter((x) => x.id !== id);
    this.persist();
    return this.proxies.length < before;
  }

  buildUpstreamUrl(p) {
    const auth = p.username ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@` : '';
    const scheme = p.protocol === 'socks5' ? 'socks5' : p.protocol === 'https' ? 'https' : 'http';
    return `${scheme}://${auth}${p.host}:${p.port}`;
  }

  // ---- selection strategies ----
  pick(sessionKey) {
    const pool = this.getEnabled();
    if (pool.length === 0) return null;
    const strategy = this.settings.rotationStrategy;

    if (strategy === 'sticky' && sessionKey) {
      const cached = this.stickyMap.get(sessionKey);
      if (cached) {
        const found = pool.find((p) => p.id === cached.id);
        if (found) return found;
      }
      const chosen = this._roundRobin(pool);
      this.stickyMap.set(sessionKey, { id: chosen.id, ts: Date.now() });
      return chosen;
    }

    if (strategy === 'random_unique') {
      const candidates = pool.length > 1 ? pool.filter((p) => p.id !== this.lastPickedId) : pool;
      const chosen = candidates[crypto.randomInt(0, candidates.length)];
      this.lastPickedId = chosen.id;
      return chosen;
    }

    if (strategy === 'random') {
      let chosen = pool[crypto.randomInt(0, pool.length)];
      if (pool.length > 1 && chosen.id === this.lastPickedId) {
        chosen = pool.filter((p) => p.id !== this.lastPickedId)[crypto.randomInt(0, pool.length - 1)];
      }
      this.lastPickedId = chosen.id;
      return chosen;
    }

    if (strategy === 'least_used') {
      let best = pool[0];
      let bestCount = this.activeConns.get(best.id) || 0;
      for (const p of pool) {
        const c = this.activeConns.get(p.id) || 0;
        if (c < bestCount) {
          best = p;
          bestCount = c;
        }
      }
      return best;
    }

    if (strategy === 'best_latency') {
      const withLatency = pool.filter((p) => p.health.latencyMs != null);
      const source = withLatency.length ? withLatency : pool;
      return source.reduce((a, b) => ((a.health.latencyMs ?? 99999) <= (b.health.latencyMs ?? 99999) ? a : b));
    }

    // default round_robin
    return this._roundRobin(pool);
  }

  _roundRobin(pool) {
    let idx = this.rrCursor % pool.length;
    const chosen = pool[idx];
    this.rrCursor = (this.rrCursor + 1) % pool.length;
    this.lastPickedId = chosen.id;
    return chosen;
  }

  incConn(id, delta) {
    this.activeConns.set(id, Math.max(0, (this.activeConns.get(id) || 0) + delta));
  }

  recordRequest({ proxyId, bytesIn = 0, bytesOut = 0, ok = true, targetHost = '', clientIp = '' }) {
    this.stats.totalRequests += 1;
    this.stats.totalBytesIn += bytesIn;
    this.stats.totalBytesOut += bytesOut;
    if (proxyId) {
      if (!this.stats.perProxy[proxyId]) {
        this.stats.perProxy[proxyId] = { requests: 0, bytesIn: 0, bytesOut: 0, fails: 0 };
      }
      const s = this.stats.perProxy[proxyId];
      s.requests += 1;
      s.bytesIn += bytesIn;
      s.bytesOut += bytesOut;
      if (!ok) s.fails += 1;
    }
    this.stats.recentLogs.push({
      ts: new Date().toISOString(),
      proxyId,
      targetHost,
      clientIp,
      ok,
      bytesIn,
      bytesOut,
    });
  }

  async healthCheckOne(p) {
    const started = Date.now();
    const upstreamProxyUrl = this.buildUpstreamUrl(p);
    try {
      const axiosProxyOpts =
        p.protocol === 'socks5'
          ? null
          : {
              host: p.host,
              port: p.port,
              auth: p.username ? { username: p.username, password: p.password } : undefined,
              protocol: 'http',
            };
      let resp;
      if (axiosProxyOpts) {
        resp = await axios.get(CHECK_URL, {
          proxy: axiosProxyOpts,
          timeout: HEALTH_TIMEOUT_MS,
          httpAgent,
          httpsAgent,
        });
      } else {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const agent = new SocksProxyAgent(upstreamProxyUrl);
        resp = await axios.get(CHECK_URL, { httpAgent: agent, httpsAgent: agent, timeout: HEALTH_TIMEOUT_MS });
      }
      const latency = Date.now() - started;
      p.health.status = 'healthy';
      p.health.latencyMs = latency;
      p.health.lastCheck = new Date().toISOString();
      p.health.consecFails = 0;
      p.health.totalChecks += 1;
      p.health.totalOk += 1;
      p.health.exitIp = resp.data && resp.data.ip;
      return { ok: true, latency };
    } catch (err) {
      p.health.status = 'unhealthy';
      p.health.lastCheck = new Date().toISOString();
      p.health.consecFails = (p.health.consecFails || 0) + 1;
      p.health.totalChecks += 1;
      if (p.health.consecFails >= (this.settings.maxConsecFails || MAX_CONSEC_FAILS)) {
        p.health.status = 'dead';
      }
      return { ok: false, error: err.message };
    }
  }

  async healthCheckAll() {
    await Promise.all(this.proxies.map((p) => this.healthCheckOne(p)));
    this.persist();
    return this.proxies;
  }

  startHealthLoop() {
    const run = async () => {
      try {
        await this.healthCheckAll();
      } catch (e) {
        console.error('[healthCheck] error', e.message);
      }
      const delay = Math.max(20, this.settings.healthCheckIntervalSec || 120) * 1000;
      this._healthTimer = setTimeout(run, delay);
    };
    run();
  }

  stopHealthLoop() {
    if (this._healthTimer) clearTimeout(this._healthTimer);
  }

  cleanupSticky() {
    const now = Date.now();
    const ttl = this.settings.stickyTtlMs || 10 * 60 * 1000;
    for (const [k, v] of this.stickyMap.entries()) {
      if (now - v.ts > ttl) this.stickyMap.delete(k);
    }
  }

  summary() {
    const proxies = this.proxies;
    const healthy = proxies.filter((p) => p.health.status === 'healthy').length;
    const unhealthy = proxies.filter((p) => p.health.status === 'unhealthy').length;
    const dead = proxies.filter((p) => p.health.status === 'dead').length;
    const enabled = proxies.filter((p) => p.enabled).length;
    const latencies = proxies.filter((p) => p.health.latencyMs != null).map((p) => p.health.latencyMs);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
    return {
      totalProxies: proxies.length,
      enabled,
      healthy,
      unhealthy,
      dead,
      avgLatencyMs: avgLatency,
      totalRequests: this.stats.totalRequests,
      totalBytesIn: this.stats.totalBytesIn,
      totalBytesOut: this.stats.totalBytesOut,
      startedAt: this.stats.startedAt,
      rotationStrategy: this.settings.rotationStrategy,
      gatewayEnabled: this.settings.gatewayEnabled,
      countries: this.countrySummary(),
    };
  }

  countrySummary() {
    const map = new Map();
    for (const p of this.proxies) {
      if (!p.enabled) continue;
      const code = p.countryCode || 'UN';
      const name = p.country || 'Unknown';
      const flag = p.flag || '🏳️';
      if (!map.has(code)) {
        map.set(code, { country: name, countryCode: code, flag, count: 0, healthy: 0 });
      }
      const e = map.get(code);
      e.count += 1;
      if (p.health.status === 'healthy') e.healthy += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  pickByCountry(countryCode, sessionKey) {
    let pool = this.getEnabled();
    if (countryCode) {
      const code = String(countryCode).toUpperCase();
      pool = pool.filter((p) => (p.countryCode || '').toUpperCase() === code);
    }
    if (pool.length === 0) return null;

    let candidates = pool.filter((p) => p.id !== this.lastPickedId);
    if (candidates.length === 0) candidates = pool;

    const strategy = this.settings.rotationStrategy;
    let chosen;
    if (strategy === 'least_used') {
      chosen = candidates.reduce((a, b) => ((this.activeConns.get(a.id) || 0) <= (this.activeConns.get(b.id) || 0) ? a : b));
    } else if (strategy === 'best_latency') {
      chosen = candidates.reduce((a, b) => ((a.health.latencyMs ?? 99999) <= (b.health.latencyMs ?? 99999) ? a : b));
    } else if (strategy === 'round_robin') {
      const idx = this.rrCursor % candidates.length;
      this.rrCursor = (this.rrCursor + 1) % candidates.length;
      chosen = candidates[idx];
    } else {
      chosen = candidates[crypto.randomInt(0, candidates.length)];
    }
    this.lastPickedId = chosen.id;
    return chosen;
  }
}

module.exports = { ProxyPool, httpAgent, httpsAgent };
