admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-brand"><span class="brand-mark">🛰️</span> <span>NebulaProxy</span></div>
        <div class="admin-sidebar-label">Panel</div>
        ${ADMIN_TABS.map((t) => `<div class="side-link ${t.key === adminState.tab ? 'active' : ''}" data-tab="${t.key}"><span class="side-icon">${t.icon}</span><span>${t.label}</span></div>`).join('')}
        <div class="side-spacer"></div>
        ${renderLangSwitcher()}
        <a href="#/" class="side-link">🏠 <span>Back to Site</span></a>
        <div class="side-link side-danger" id="logoutBtn">🚪 <span>Logout</span></div>
      </aside>
      <main class="admin-main" id="adminMain"><div class="loading">Loading…</div></main>
    </div>
  `;
  document.querySelectorAll('.side-link[data-tab]').forEach((el) => el.addEventListener('click', () => {
    adminState.tab = el.dataset.tab;
    document.querySelectorAll('.side-link[data-tab]').forEach((x) => x.classList.remove('active'));
    el.classList.add('active');
    loadAdminTab(adminState.tab);
  }));
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api.post('/api/auth/logout'); location.hash = '#/login';
  });
}

async function loadAdminTab(tab) {
  const main = document.getElementById('adminMain');
  main.innerHTML = `<div class="loading">Loading ${tab}…</div>`;
  try {
    const T = { overview: renderOverviewTab, proxies: renderProxiesTab, settings: renderSettingsTab, rotation: renderRotationTab, system: renderSystemTab, credentials: renderCredentialsTab, logs: renderLogsTab, deploy: renderDeployTab };
    if (T[tab]) await T[tab](main);
  } catch (err) { main.innerHTML = `<div class="empty-state">⚠️ ${err.message}</div>`; }
}

// ============ OVERVIEW ============
async function renderOverviewTab(main) {
  const s = await api.get('/api/admin/summary');
  const healthyPct = s.totalProxies ? Math.round((s.healthy / s.totalProxies) * 100) : 0;
  main.innerHTML = `
    <div class="admin-header">
      <div><h1>Overview</h1><p class="admin-sub">Real-time gateway health and traffic.</p></div>
      <span class="pill ${s.gateway.running ? 'pill-ok' : 'pill-danger'}">${s.gateway.running ? '● Gateway Online' : '● Gateway Offline'}</span>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="lbl">Total Proxies</div><div class="val">${s.totalProxies}</div><div class="sub">${s.enabled} enabled</div></div>
      <div class="kpi-card"><div class="lbl">Healthy</div><div class="val ok">${s.healthy}</div><div class="sub">${healthyPct}% · ${s.dead} dead</div></div>
      <div class="kpi-card"><div class="lbl">Avg Latency</div><div class="val">${s.avgLatencyMs != null ? s.avgLatencyMs + ' ms' : '—'}</div><div class="sub">across nodes</div></div>
      <div class="kpi-card"><div class="lbl">Total Requests</div><div class="val">${s.totalRequests}</div><div class="sub">since ${fmtTime(s.startedAt)}</div></div>
    </div>
    <div class="panel">
      <div class="panel-title"><h3>📡 Gateway Connection</h3><span class="pill pill-neutral">${s.rotationStrategy.replace(/_/g, ' ')}</span></div>
      <div class="credentials-box">
        <div class="cred-row"><span class="k">Host</span><span class="v mono">${s.gateway.host}</span></div>
        <div class="cred-row"><span class="k">Port</span><span class="v mono">${s.gateway.port}</span></div>
        <div class="cred-row"><span class="k">Username</span><span class="v mono">${s.gateway.user}</span></div>
        <div class="cred-row"><span class="k">Started</span><span class="v">${fmtTime(s.gateway.startedAt)}</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title"><h3>📦 Traffic</h3></div>
      <div class="two-col">
        <div class="cred-row"><span class="k">Bytes In</span><span class="v">${fmtBytes(s.totalBytesIn)}</span></div>
        <div class="cred-row"><span class="k">Bytes Out</span><span class="v">${fmtBytes(s.totalBytesOut)}</span></div>
      </div>
    </div>
  `;
}

// ============ PROXIES ============
async function renderProxiesTab(main) {
  const { proxies } = await api.get('/api/admin/proxies');
  adminState.proxies = proxies;
  const byCountry = {};
  for (const p of proxies) { const k = p.country || 'Unknown'; byCountry[k] = (byCountry[k] || 0) + 1; }
  const chips = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([c, n]) => {
    const fl = (proxies.find((p) => p.country === c) || {}).flag || '🏳️';
    return `<span class="country-chip"><span class="flag">${fl}</span><span class="cname">${c}</span><span class="ccount">${n}</span></span>`;
  }).join(' ');

  main.innerHTML = `
    <div class="admin-header">
      <div><h1>Proxy Pool (${proxies.length})</h1><p class="admin-sub">Manage upstream proxies.</p></div>
      <div style="display:flex;gap:10px;">
        <button class="btn" id="checkAllBtn">💚 Health Check All</button>
        <button class="btn btn-primary" id="addProxyBtn">➕ Add Proxy</button>
      </div>
    </div>
    <div class="panel"><div class="panel-title"><h3>🌍 Country Coverage</h3></div><div class="country-grid">${chips || '<span class="country-chip muted">No geo</span>'}</div></div>
    <div class="panel">
      <div class="panel-title"><h3>Bulk Import</h3></div>
      <p class="small-note">One proxy per line: <code>ip:port:user:pass</code></p>
      <textarea id="bulkText" class="textarea-mono" placeholder="1.2.3.4:8080:user:pass&#10;5.6.7.8:8080:user:pass"></textarea>
      <div style="margin-top:12px;"><button class="btn btn-primary" id="bulkImportBtn">Import Lines</button></div>
    </div>
    <div class="panel">
      <div class="panel-title"><h3>Proxies</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Label</th><th>Host:Port</th><th>Location</th><th>Status</th><th>Latency</th><th>Enabled</th><th></th></tr></thead>
          <tbody id="proxyRows"></tbody>
        </table>
      </div>
    </div>
  `;
  paintProxyRows(proxies);
  document.getElementById('checkAllBtn').addEventListener('click', async () => {
    toast('Running health checks…', 'ok');
    try { const r = await api.post('/api/admin/proxies/check-all'); paintProxyRows(r.proxies); toast('Health check complete', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
  document.getElementById('addProxyBtn').addEventListener('click', openProxyModal);
  document.getElementById('bulkImportBtn').addEventListener('click', async () => {
    const text = document.getElementById('bulkText').value.trim();
    if (!text) return toast('Paste at least one proxy line', 'err');
    try { const r = await api.post('/api/admin/proxies/bulk', { text }); toast(`Imported ${r.added} proxies`, 'ok'); renderProxiesTab(main); }
    catch (e) { toast(e.message, 'err'); }
  });
}

function paintProxyRows(proxies) {
  const tbody = document.getElementById('proxyRows');
  if (!tbody) return;
  tbody.innerHTML = proxies.map((p) => {
    const st = p.health ? p.health.status : 'unknown';
    const dot = st === 'healthy' ? '🟢' : st === 'unhealthy' ? '🟡' : st === 'dead' ? '🔴' : '⚪';
    return `<tr>
      <td><strong>${p.label || p.id}</strong></td>
      <td class="mono">${p.host}:${p.port}</td>
      <td>${p.flag || ''} ${p.country || 'Unknown'}${p.city ? ' · ' + p.city : ''}</td>
      <td>${dot} ${st}</td>
      <td>${p.health && p.health.latencyMs != null ? p.health.latencyMs + ' ms' : '—'}</td>
      <td><label class="switch"><input type="checkbox" data-toggle="${p.id}" ${p.enabled ? 'checked' : ''}><span class="slider"></span></label></td>
      <td class="row-actions">
        <button class="icon-btn" data-check="${p.id}" title="Check">🔁</button>
        <button class="icon-btn" data-del="${p.id}" title="Delete">🗑️</button>
      </td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-toggle]').forEach((cb) => cb.addEventListener('change', async (e) => {
    try { await api.patch(`/api/admin/proxies/${cb.dataset.toggle}`, { enabled: cb.checked }); toast(cb.checked ? 'Enabled' : 'Disabled', 'ok'); }
    catch (err) { toast(err.message, 'err'); cb.checked = !cb.checked; }
  }));
  tbody.querySelectorAll('[data-check]').forEach((b) => b.addEventListener('click', async () => {
    toast('Checking…', 'ok');
    try { await api.post(`/api/admin/proxies/${b.dataset.check}/check`); renderProxiesTab(document.getElementById('adminMain')); }
    catch (e) { toast(e.message, 'err'); }
  }));
  tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this proxy?')) return;
    try { await api.del(`/api/admin/proxies/${b.dataset.del}`); renderProxiesTab(document.getElementById('adminMain')); toast('Deleted', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  }));
}

function openProxyModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">
    <div class="modal-head"><h3>Add Proxy</h3><button class="icon-btn" id="closeModal">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>Label</label><input id="mLabel" placeholder="Webshare-11"></div>
      <div class="field"><label>Host</label><input id="mHost" placeholder="1.2.3.4"></div>
      <div class="field"><label>Port</label><input id="mPort" type="number" placeholder="8080"></div>
      <div class="two-col">
        <div class="field"><label>Username</label><input id="mUser" placeholder="user"></div>
        <div class="field"><label>Password</label><input id="mPass" placeholder="pass"></div>
      </div>
      <div class="field"><label>Protocol</label><select id="mProto"><option>http</option><option>https</option><option>socks5</option></select></div>
    </div>
    <div class="modal-foot"><button class="btn" id="cancelModal">Cancel</button><button class="btn btn-primary" id="saveModal">Add Proxy</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeModal').onclick = () => overlay.remove();
  overlay.querySelector('#cancelModal').onclick = () => overlay.remove();
  overlay.querySelector('#saveModal').onclick = async () => {
    const body = {
      label: overlay.querySelector('#mLabel').value, host: overlay.querySelector('#mHost').value,
      port: Number(overlay.querySelector('#mPort').value), username: overlay.querySelector('#mUser').value,
      password: overlay.querySelector('#mPass').value, protocol: overlay.querySelector('#mProto').value,
    };
    if (!body.host || !body.port) return toast('Host and port required', 'err');
    try { await api.post('/api/admin/proxies', body); overlay.remove(); toast('Proxy added', 'ok'); renderProxiesTab(document.getElementById('adminMain')); }
    catch (e) { toast(e.message, 'err'); }
  };
}

// ============ SETTINGS (real) ============
async function renderSettingsTab(main) {
  const st = await api.get('/api/admin/settings');
  adminState.settings = st;
  const accs = (st.accounts || []).map((a) => `<div class="cred-row"><span class="k">${a.label} (${a.plan})</span><span class="v mono">${a.username} · ${a.proxies} proxies</span></div>`).join('');
  main.innerHTML = `
    <div class="admin-header"><div><h1>Settings</h1><p class="admin-sub">Configure global gateway behavior.</p></div></div>
    <div class="panel">
      <div class="panel-title"><h3>⚙️ General</h3></div>
      <div class="field">
        <label>Health check interval (seconds)</label>
        <input type="number" id="setInterval" value="${st.healthCheckIntervalSec ?? 120}" min="20">
      </div>
      <div class="field">
        <label>Health check timeout (ms)</label>
        <input type="number" id="setTimeoutMs" value="${st.healthCheckTimeoutMs ?? 9000}" min="1000">
      </div>
      <div class="field">
        <label>Max consecutive failures before quarantine</label>
        <input type="number" id="setMaxFail" value="${st.maxConsecFails ?? 3}" min="1">
      </div>
      <div class="field">
        <label>Sticky session TTL (ms)</label>
        <input type="number" id="setStickyTtl" value="${st.stickyTtlMs ?? 600000}" min="10000">
      </div>
      <div class="field-check">
        <label class="switch"><input type="checkbox" id="setGateway" ${st.gatewayEnabled ? 'checked' : ''}><span class="slider"></span></label>
        <span>Gateway enabled</span>
      </div>
      <div class="field-check">
        <label class="switch"><input type="checkbox" id="setApiKey" ${st.requireApiKeyPublic ? 'checked' : ''}><span class="slider"></span></label>
        <span>Require API key on public /api/proxy</span>
      </div>
      <div style="margin-top:16px;"><button class="btn btn-primary" id="saveSettingsBtn">💾 Save Settings</button></div>
    </div>
    <div class="panel">
      <div class="panel-title"><h3>👥 Accounts</h3></div>
      <div class="credentials-box">${accs || '<div class="empty-state">No accounts configured</div>'}</div>
      <p class="small-note">Webshare accounts provide the upstream proxy pool. Both accounts resolve to the same 10 exit IPs (the free plan shares a regional pool), so the second account adds concurrent connection budget rather than unique IPs.</p>
    </div>
  `;
  document.getElementById('saveSettingsBtn').onclick = async () => {
    const body = {
      healthCheckIntervalSec: Number(document.getElementById('setInterval').value),
      healthCheckTimeoutMs: Number(document.getElementById('setTimeoutMs').value),
      maxConsecFails: Number(document.getElementById('setMaxFail').value),
      stickyTtlMs: Number(document.getElementById('setStickyTtl').value),
      gatewayEnabled: document.getElementById('setGateway').checked,
      requireApiKeyPublic: document.getElementById('setApiKey').checked,
    };
    try { await api.patch('/api/admin/settings', body); toast('Settings saved', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
}

// ============ ROTATION ============
async function renderRotationTab(main) {
  const st = await api.get('/api/admin/settings');
  const strategies = ['round_robin', 'random', 'random_unique', 'least_used', 'best_latency', 'sticky'];
  const desc = {
    round_robin: 'Cycles through healthy proxies in strict order — most predictable load spread.',
    random: 'A random healthy proxy per connection (avoids immediate repeats).',
    random_unique: 'Random but NEVER repeats the same exit IP twice in a row.',
    least_used: 'Routes to the proxy with the fewest active connections.',
    best_latency: 'Always prefers the lowest-latency healthy proxy.',
    sticky: 'Pins a session (X-Session-Id) to one proxy until TTL expires.',
  };
  main.innerHTML = `
    <div class="admin-header"><div><h1>Rotation Strategy</h1><p class="admin-sub">Choose how exit IPs rotate.</p></div></div>
    <div class="panel">
      <div class="panel-title"><h3>Current: ${(st.rotationStrategy || 'round_robin').replace(/_/g, ' ')}</h3></div>
      <div class="strategy-grid">
        ${strategies.map((s) => `<div class="strategy-card ${st.rotationStrategy === s ? 'selected' : ''}" data-strategy="${s}">
          <div class="strategy-name">${s.replace(/_/g, ' ')}</div>
          <div class="strategy-desc">${desc[s]}</div>
        </div>`).join('')}
      </div>
    </div>
  `;
  main.querySelectorAll('.strategy-card').forEach((c) => c.addEventListener('click', async () => {
    const s = c.dataset.strategy;
    try { await api.patch('/api/admin/settings', { rotationStrategy: s }); toast(`Strategy → ${s.replace(/_/g, ' ')}`, 'ok'); renderRotationTab(main); }
    catch (e) { toast(e.message, 'err'); }
  }));
}

// ============ SYSTEM ============
async function renderSystemTab(main) {
  const g = await api.get('/api/admin/system/gateway');
  const st = await api.get('/api/admin/stats');
  main.innerHTML = `
    <div class="admin-header"><div><h1>System Control</h1><p class="admin-sub">Gateway lifecycle and stats.</p></div>
      <span class="pill ${g.running ? 'pill-ok' : 'pill-danger'}">${g.running ? '● Running' : '● Stopped'}</span></div>
    <div class="panel">
      <div class="panel-title"><h3>Gateway</h3></div>
      <div class="btn-row">
        <button class="btn ${g.running ? '' : 'btn-primary'}" id="gwStart" ${g.running ? 'disabled' : ''}>▶ Start</button>
        <button class="btn" id="gwRestart">🔁 Restart</button>
        <button class="btn btn-danger" id="gwStop" ${g.running ? '' : 'disabled'}>⏹ Stop</button>
      </div>
      <div class="credentials-box" style="margin-top:16px;">
        <div class="cred-row"><span class="k">Status</span><span class="v">${g.running ? 'Running' : 'Stopped'}</span></div>
        <div class="cred-row"><span class="k">Port</span><span class="v mono">${g.port}</span></div>
        <div class="cred-row"><span class="k">Started</span><span class="v">${fmtTime(g.startedAt)}</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title"><h3>📈 Statistics</h3><button class="btn btn-sm" id="resetStats">Reset</button></div>
      <div class="two-col">
        <div class="cred-row"><span class="k">Requests</span><span class="v">${st.totals.totalRequests}</span></div>
        <div class="cred-row"><span class="k">Bytes In</span><span class="v">${fmtBytes(st.totals.totalBytesIn)}</span></div>
        <div class="cred-row"><span class="k">Bytes Out</span><span class="v">${fmtBytes(st.totals.totalBytesOut)}</span></div>
        <div class="cred-row"><span class="k">Started</span><span class="v">${fmtTime(st.totals.startedAt)}</span></div>
      </div>
    </div>
  `;
  document.getElementById('gwStart').onclick = async () => { try { await api.post('/api/admin/system/gateway/start'); toast('Gateway started', 'ok'); renderSystemTab(main); } catch (e) { toast(e.message, 'err'); } };
  document.getElementById('gwStop').onclick = async () => { try { await api.post('/api/admin/system/gateway/stop'); toast('Gateway stopped', 'ok'); renderSystemTab(main); } catch (e) { toast(e.message, 'err'); } };
  document.getElementById('gwRestart').onclick = async () => { try { await api.post('/api/admin/system/gateway/restart'); toast('Gateway restarted', 'ok'); renderSystemTab(main); } catch (e) { toast(e.message, 'err'); } };
  document.getElementById('resetStats').onclick = async () => { try { await api.post('/api/admin/stats/reset'); toast('Stats reset', 'ok'); renderSystemTab(main); } catch (e) { toast(e.message, 'err'); } };
}

// ============ CREDENTIALS ============
async function renderCredentialsTab(main) {
  const c = await api.get('/api/admin/credentials');
  main.innerHTML = `
    <div class="admin-header"><div><h1>Credentials</h1><p class="admin-sub">Connection and auth details.</p></div></div>
    <div class="panel">
      <div class="panel-title"><h3>🔐 Admin</h3></div>
      <div class="credentials-box">
        <div class="cred-row"><span class="k">Username</span><span class="v mono">${c.adminUsername}</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title"><h3>🌐 Gateway Basic Auth</h3></div>
      <div class="credentials-box">
        <div class="cred-row"><span class="k">Username</span><span class="v mono">${c.gatewayUser}</span></div>
        <div class="cred-row"><span class="k">Usage</span><span class="v mono">curl -x http://${c.gatewayUser}:PASS@host:8000 &lt;target&gt;</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title"><h3>🔑 API Key</h3></div>
      <div class="credentials-box">
        <div class="cred-row"><span class="k">Key (masked)</span><span class="v mono">${c.apiKeyMasked || '—'}</span></div>
        <div class="cred-row"><span class="k">Header</span><span class="v mono">X-API-Key: &lt;key&gt;</span></div>
      </div>
    </div>
  `;
}

// ============ LOGS ============
async function renderLogsTab(main) {
  const { logs } = await api.get('/api/admin/logs?limit=100');
  adminState.logs = logs;
  main.innerHTML = `
    <div class="admin-header"><div><h1>Live Logs</h1><p class="admin-sub">Recent gateway requests (newest first).</p></div>
      <button class="btn" id="refreshLogs">🔄 Refresh</button></div>
    <div class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Proxy</th><th>Target</th><th>Status</th><th>In</th><th>Out</th></tr></thead>
          <tbody>${logs.length ? logs.map((l) => `<tr>
            <td class="mono">${new Date(l.ts).toLocaleTimeString()}</td>
            <td>${l.proxyId || '—'}</td><td class="mono">${l.targetHost || '—'}</td>
            <td>${l.ok ? '✅' : '❌'}</td><td>${fmtBytes(l.bytesIn)}</td><td>${fmtBytes(l.bytesOut)}</td>
          </tr>`).join('') : '<tr><td colspan="6" class="empty-state">No requests yet — send traffic through the gateway to populate logs.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('refreshLogs').onclick = () => renderLogsTab(main);
}

// ============ DEPLOY ============
async function renderDeployTab(main) {
  const g = await api.get('/api/admin/credentials');
  main.innerHTML = `
    <div class="admin-header"><div><h1>Deployment</h1><p class="admin-sub">Run anywhere — VPS, Docker, home server.</p></div></div>
    <div class="panel">
      <div class="panel-title"><h3>🚀 Quick Steps</h3></div>
      <ol class="deploy-steps">
        <li><strong>Install</strong> — <code>npm install</code></li>
        <li><strong>Configure</strong> — edit <code>.env</code> (PUBLIC_HOST, credentials)</li>
        <li><strong>Run</strong> — <code>npm start</code> → portal :3000, gateway :8000</li>
        <li><strong>Expose</strong> — point a domain at your server, terminate TLS with Caddy/Nginx</li>
        <li><strong>Connect</strong> — use <code>gateway-host:8000</code> as your HTTP proxy</li>
      </ol>
    </div>
    <div class="panel">
      <div class="panel-title"><h3>🐳 Docker</h3></div>
      <pre><code>docker build -t nebulaproxy .
docker run -d -p 3000:3000 -p 8000:8000 --env-file .env nebulaproxy</code></pre>
    </div>
    <div class="panel">
      <div class="panel-title"><h3>📘 Guides</h3></div>
      <p class="small-note">See <code>DEPLOY_GUIDE.txt</code>, <code>DOMAIN_GUIDD.txt</code>, and <code>CLOUDFLARE_WORKERS_GUIDE.txt</code> in the project root for full, step-by-step deployment and free-domain instructions.</p>
    </div>
  `;
}
