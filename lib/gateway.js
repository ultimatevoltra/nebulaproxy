const { Server: ProxyChainServer, RequestError } = require('proxy-chain');
const { httpAgent, httpsAgent } = require('./proxyPool');

/**
 * Creates and starts the rotating-proxy gateway server.
 * Any client that connects to this server (with GATEWAY_USER/GATEWAY_PASS)
 * gets automatically routed through one of the healthy upstream proxies,
 * chosen according to the configured rotation strategy.
 */
function createGateway({ pool, port, gatewayUser, gatewayPass, log }) {
  // Map connectionId -> chosen proxyId, so we can correctly attribute
  // byte counts and success/failure when the connection finally closes.
  // (proxy-chain v3 only emits `connectionClosed` when a socket ends; it does
  // NOT emit any per-request "tunnelConnectResponded" event.)
  const connProxy = new Map();

  const server = new ProxyChainServer({
    port,
    verbose: false,
    prepareRequestFunction: ({ request, username, password, hostname, port: targetPort, connectionId }) => {
      // 1. Gateway-level authentication
      if (!pool.settings.gatewayEnabled) {
        throw new RequestError('Gateway is currently disabled by the administrator.', 503);
      }
      if (gatewayUser) {
        if (username !== gatewayUser || password !== gatewayPass) {
          return {
            requestAuthentication: true,
            failMsg: 'Invalid rotating-proxy gateway credentials.',
          };
        }
      }

      // 2. Session key for sticky rotation
      const sessionKey =
        (request.headers['x-session-id'] && String(request.headers['x-session-id'])) ||
        (request.socket && request.socket.remoteAddress) ||
        String(connectionId);

      // 3. Pick an upstream proxy from the pool
      const chosen = pool.pick(sessionKey);
      if (!chosen) {
        throw new RequestError('No healthy upstream proxies available in the pool.', 502);
      }

      pool.incConn(chosen.id, 1);
      connProxy.set(connectionId, { proxyId: chosen.id, hostname, targetPort });

      const upstreamProxyUrl = pool.buildUpstreamUrl(chosen);

      return {
        upstreamProxyUrl,
        httpAgent,
        httpsAgent,
        customTag: { proxyId: chosen.id, hostname, targetPort, connectionId },
      };
    },
  });

  server.on('connectionClosed', ({ connectionId, stats }) => {
    const meta = connProxy.get(connectionId);
    if (meta && meta.proxyId) {
      const bytesIn = (stats && stats.srcRxBytes) || 0;
      const bytesOut = (stats && stats.srcTxBytes) || 0;
      pool.incConn(meta.proxyId, -1);
      pool.recordRequest({
        proxyId: meta.proxyId,
        ok: true,
        targetHost: meta.hostname,
        bytesIn,
        bytesOut,
      });
      connProxy.delete(connectionId);
    }
  });

  server.on('requestFailed', ({ request, error }) => {
    const connectionId = request && request.socket && request.socket.proxyChainId;
    const meta = connectionId != null ? connProxy.get(connectionId) : null;
    if (meta && meta.proxyId) {
      pool.incConn(meta.proxyId, -1);
      pool.recordRequest({ proxyId: meta.proxyId, ok: false, targetHost: meta.hostname });
      connProxy.delete(connectionId);
    }
    log && log(`request failed: ${request && request.url}`, error && error.message);
  });

  server.on('tlsError', ({ socket, error }) => {
    const connectionId = socket && socket.proxyChainId;
    const meta = connectionId != null ? connProxy.get(connectionId) : null;
    if (meta && meta.proxyId) {
      pool.incConn(meta.proxyId, -1);
      pool.recordRequest({ proxyId: meta.proxyId, ok: false, targetHost: meta.hostname });
      connProxy.delete(connectionId);
    }
    log && log('TLS handshake error', error && error.message);
  });

  return server;
}

module.exports = { createGateway };
