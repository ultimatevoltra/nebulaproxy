function renderNav(active) {
  const links = [
    { href: '#/', key: 'home', label: t('nav.home') },
    { href: '#/docs', key: 'docs', label: t('nav.docs') },
    { href: '#/login', key: 'login', label: t('nav.admin') },
  ];
  return `
  <nav class="navbar">
    <div class="container nav-inner">
      <a href="#/" class="brand"><span class="brand-mark">🛰️</span> <span class="brand-name">NebulaProxy</span></a>
      <div class="nav-links">
        ${links.map((l) => `<a href="${l.href}" data-nav="${l.key}" class="${l.key === active ? 'active' : ''}">${l.label}</a>`).join('')}
      </div>
      <div class="nav-tools">
        ${renderLangSwitcher()}
        <a href="#/login" class="btn btn-primary btn-sm">${t('nav.adminPanel')}</a>
      </div>
    </div>
  </nav>`;
}

function renderFooter() {
  return `
  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <span class="brand-mark">🛰️</span>
        <div>
          <div class="footer-name">NebulaProxy</div>
          <div class="footer-tag">${t('footer.tagline')}</div>
        </div>
      </div>
      <div class="footer-links">
        <a href="#/">${t('nav.home')}</a>
        <a href="#/docs">${t('nav.docs')}</a>
        <a href="#/login">${t('nav.admin')}</a>
      </div>
      <div class="footer-meta">© ${new Date().getFullYear()} NebulaProxy · ${t('footer.built')}</div>
    </div>
  </footer>`;
}
