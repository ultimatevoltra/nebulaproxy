// ===== Landing page — crafted, content-rich, real data =====
function renderLanding() {
  document.getElementById('app').innerHTML = `
    ${renderNav('home')}

    <section class="hero">
      <div class="container">
        <div class="hero-badge"><span class="dot-pulse"></span> ${t('hero.badge')} · <span id="heroNodeCount">…</span> ${t('hero.nodes')} · <span id="heroAccountCount"></span></div>
        <h1 class="hero-title">${t('hero.title1')} <span class="grad">${t('hero.title2')}</span></h1>
        <p class="hero-sub">${t('hero.subtitle')}</p>
        <div class="hero-actions">
          <a href="#/docs" class="btn btn-primary btn-lg">${t('hero.readDocs')} <span class="arrow">→</span></a>
          <a href="#/login" class="btn btn-ghost btn-lg">${t('hero.adminLogin')}</a>
        </div>
        <div class="hero-meta" id="heroMeta"></div>
      </div>
    </section>

    ${renderLiveTerminal()}

    <section class="section" id="overview">
      <div class="container">
        <div class="stats-strip" id="landingStats">${renderStatSkeleton()}</div>
      </div>
    </section>

    <section class="section" id="features">
      <div class="container">
        <div class="section-head">
          <span class="section-eyebrow">${t('feat.eyebrow')}</span>
          <h2>${t('feat.heading')}</h2>
          <p>${t('feat.sub')}</p>
        </div>
        <div class="grid grid-4" id="featureGrid">${renderFeatureCards()}</div>
      </div>
    </section>

    <section class="section" id="architecture">
      <div class="container">
        <div class="section-head">
          <span class="section-eyebrow">${t('arch.eyebrow')}</span>
          <h2>${t('arch.heading')}</h2>
          <p>${t('arch.sub')}</p>
        </div>
        ${renderArchitecture()}
      </div>
    </section>

    <section class="section" id="countries">
      <div class="container">
        <div class="section-head">
          <span class="section-eyebrow">${t('countries.eyebrow')}</span>
          <h2>${t('countries.heading')}</h2>
          <p>${t('countries.sub')}</p>
        </div>
        <div class="country-grid" id="countryGrid"><div class="country-chip muted">…</div></div>
      </div>
    </section>

    <section class="section" id="how">
      <div class="container">
        <div class="section-head">
          <span class="section-eyebrow">${t('how.eyebrow')}</span>
          <h2>${t('how.heading')}</h2>
          <p>${t('how.sub')}</p>
        </div>
        <div class="grid grid-3 steps">
          <div class="card step"><div class="step-num">01</div><div class="icon">🔌</div><h3>${t('how.step1.t')}</h3><p>${t('how.step1.d')}</p></div>
          <div class="card step"><div class="step-num">02</div><div class="icon">🔄</div><h3>${t('how.step2.t')}</h3><p>${t('how.step2.d')}</p></div>
          <div class="card step"><div class="step-num">03</div><div class="icon">🚀</div><h3>${t('how.step3.t')}</h3><p>${t('how.step3.d')}</p></div>
        </div>
      </div>
    </section>

    ${renderFooter()}
  `;
  loadLandingStats();
  loadCountryGrid();
  loadHeroMeta();
}

function renderStatSkeleton() {
  return `
    <div class="stat-card"><div class="num" data-count="0">0</div><div class="lbl">${t('stat.nodes')}</div></div>
    <div class="stat-card"><div class="num" data-count="0">0</div><div class="lbl">${t('stat.healthy')}</div></div>
    <div class="stat-card"><div class="num stat-ok" data-count="0">0</div><div class="lbl">${t('stat.requests')}</div></div>
    <div class="stat-card"><div class="num">—</div><div class="lbl">${t('stat.rotation')}</div></div>
    <div class="stat-card"><div class="num">—</div><div class="lbl">${t('stat.gateway')}</div></div>
  `;
}

function renderFeatureCards() {
  const F = [
    { icon: '🔄', t: t('feat.rotation'), d: t('feat.rotation.d') },
    { icon: '🌍', t: t('feat.geo'), d: t('feat.geo.d') },
    { icon: '🔌', t: t('feat.api'), d: t('feat.api.d') },
    { icon: '⚡', t: t('feat.pool'), d: t('feat.pool.d') },
    { icon: '🐚', t: t('feat.health'), d: t('feat.health.d') },
    { icon: '🔒', t: t('feat.secure'), d: t('feat.secure.d') },
    { icon: '📊', t: t('feat.analytics'), d: t('feat.analytics.d') },
    { icon: '🛠️', t: t('feat.control'), d: t('feat.control.d') },
  ];
  return F.map((f) => `<div class="card feature-reveal"><div class="icon">${f.icon}</div><h3>${f.t}</h3><p>${f.d}</p></div>`).join('');
}

function renderArchitecture() {
  return `
    <div class="arch-flow">
      <div class="arch-node arch-node-client">
        <div class="arch-ico">📱</div>
        <div class="arch-t">${t('arch.client.t')}</div>
        <div class="arch-d">${t('arch.client.d')}</div>
      </div>
      <div class="arch-arrow">→</div>
      <div class="arch-node arch-node-gateway">
        <div class="arch-ico">🛰️</div>
        <div class="arch-t">${t('arch.gateway.t')}</div>
        <div class="arch-d">${t('arch.gateway.d')}</div>
      </div>
      <div class="arch-arrow">→</div>
      <div class="arch-node arch-node-pool">
        <div class="arch-ico">🌐</div>
        <div class="arch-t">${t('arch.pool.t')}</div>
        <div class="arch-d" id="archPoolCount">${t('arch.pool.d')}</div>
      </div>
    </div>
  `;
}

function renderLiveTerminal() {
  return `
    <section class="section terminal-section">
      <div class="container narrow">
        <div class="terminal">
          <div class="terminal-bar">
            <span class="t-dot r"></span><span class="t-dot y"></span><span class="t-dot g"></span>
            <span class="terminal-title">${t('hero.live')} — rotation demo</span>
          </div>
          <div class="terminal-body" id="terminalBody">
            <div class="t-line t-cmd"><span class="t-prompt">$</span> curl --proxy "http://user:pass@gateway:8000" https://api.ipify.org</div>
            <div class="t-line t-out" id="terminalOutput">${t('terminal.running')}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

async function loadLandingStats() {
  try {
    const s = await api.get('/api/status');
    const el = document.getElementById('landingStats');
    if (el) {
      el.innerHTML = `
        <div class="stat-card"><div class="num" data-count="${s.proxiesTotal}">0</div><div class="lbl">${t('stat.nodes')}</div></div>
        <div class="stat-card"><div class="num" data-count="${s.proxiesHealthy}">0</div><div class="lbl">${t('stat.healthy')}</div></div>
        <div class="stat-card"><div class="num stat-ok" data-count="${s.totalRequests || 0}">0</div><div class="lbl">${t('stat.requests')}</div></div>
        <div class="stat-card"><div class="num">${(s.rotationStrategy || '').replace(/_/g, ' ')}</div><div class="lbl">${t('stat.rotation')}</div></div>
        <div class="stat-card"><div class="num ${s.gatewayRunning ? 'stat-ok' : 'stat-bad'}">${s.gatewayRunning ? t('stat.online') : t('stat.offline')}</div><div class="lbl">${t('stat.gateway')}</div></div>
      `;
      animateCounters(el);
    }
    const hc = document.getElementById('heroNodeCount');
    if (hc) hc.textContent = String(s.proxiesTotal);
    const ac = document.getElementById('heroAccountCount');
    if (ac && s.accountsTotal) ac.textContent = `· ${s.accountsTotal} accounts`;
    const apc = document.getElementById('archPoolCount');
    if (apc && s.proxiesTotal) apc.textContent = `${s.proxiesTotal} ${t('arch.pool.suffix')}`;
  } catch (e) { /* backend not running — leave skeleton */ }
}

async function loadHeroMeta() {
  try {
    const s = await api.get('/api/status');
    const el = document.getElementById('heroMeta');
    if (!el) return;
    const lat = s.avgLatencyMs != null ? `${s.avgLatencyMs} ms avg` : '';
    el.innerHTML = `
      <span class="meta-chip">⚡ ${lat || '—'}</span>
      <span class="meta-chip">🌍 ${s.countries ? s.countries.length : 0} countries</span>
      <span class="meta-chip">${s.gatewayRunning ? '🟢' : '🔴'} gateway ${s.gatewayRunning ? 'live' : 'offline'}</span>
    `;
  } catch (e) {}
}

async function loadCountryGrid() {
  try {
    const d = await api.get('/api/proxy/countries');
    const grid = document.getElementById('countryGrid');
    const countries = d.countries || [];
    if (!grid) return;
    if (!countries.length) { grid.innerHTML = '<span class="country-chip muted">—</span>'; return; }
    grid.innerHTML = countries.map((c) =>
      `<div class="country-chip"><span class="flag">${c.flag}</span><span class="cname">${c.country}</span><span class="cmeta">${c.cities ? c.cities.length + ' cities · ' : ''}${c.count} node${c.count > 1 ? 's' : ''} · ${c.healthy} live</span><span class="ccount">${c.countryCode}</span></div>`
    ).join('');
  } catch (e) { /* ignore */ }
}

// animated terminal rotation demo — actually hits /api/proxy
async function runTerminalDemo() {
  const out = document.getElementById('terminalOutput');
  if (!out) return;
  const lines = [];
  try {
    for (let i = 0; i < 5; i++) {
      const r = await api.get('/api/proxy');
      lines.push(`→ ${r.ip}  (${r.countryCode || ''}${r.city ? ' · ' + r.city : ''})  ${r.flag || ''}`);
    }
  } catch (e) {
    lines.push(`⚠ ${e.message}`);
  }
  const body = document.getElementById('terminalBody');
  if (body) {
    lines.forEach((l, idx) => {
      const div = document.createElement('div');
      div.className = 't-line t-out';
      div.style.animationDelay = `${idx * 0.15}s`;
      div.textContent = l;
      body.appendChild(div);
    });
  }
}

function animateCounters(root) {
  const els = root.querySelectorAll('[data-count]');
  els.forEach((el) => {
    const target = parseInt(el.getAttribute('data-count'), 10) || 0;
    const dur = 1100;
    const t0 = performance.now();
    function step(t) {
      const p = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}
