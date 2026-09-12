function renderLogin() {
  document.getElementById('app').innerHTML = `
    ${renderNav('login')}
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-logo">🛰️</div>
        <h1>${t('login.title')}</h1>
        <div class="sub">${t('login.sub')}</div>
        <form id="loginForm">
          <div class="field">
            <label>${t('login.username')}</label>
            <input type="text" id="loginUser" autocomplete="username" placeholder="admin" required />
          </div>
          <div class="field">
            <label>${t('login.password')}</label>
            <input type="password" id="loginPass" autocomplete="current-password" placeholder="••••••••••••" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block">${t('login.signin')}</button>
          <div class="error-msg" id="loginError"></div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    try {
      await api.post('/api/auth/login', { username, password });
      toast(t('login.welcome'), 'ok');
      location.hash = '#/admin';
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}
