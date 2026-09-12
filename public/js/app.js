function router() {
  const hash = location.hash || '#/';
  const path = (hash.split('#').filter(Boolean)[0] || '/');
  const jump = hash.split('#')[2];

  if (path === '/') { renderLanding(); setTimeout(runTerminalDemo, 400); return; }
  if (path === '/docs') {
    renderDocs();
    if (jump) setTimeout(() => { const el = document.getElementById(jump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    return;
  }
  if (path === '/login') { renderLogin(); return; }
  if (path.startsWith('/admin')) { const tab = path.split('/')[2] || 'overview'; renderAdmin(tab); return; }
  renderLanding();
}

function runRouter() {
  router();
  setTimeout(bindLangSwitcher, 0);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', runRouter);
window.addEventListener('DOMContentLoaded', runRouter);
if (document.readyState !== 'loading') runRouter();
