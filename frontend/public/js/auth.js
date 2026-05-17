const Auth = (() => {
  let currentUser = null;

  async function init() {
    const token = localStorage.getItem('goaliq_token');
    if (!token) return renderGuest();
    try {
      api.setToken(token);
      const { user } = await api.me();
      currentUser = user;
      renderUser(user);
    } catch {
      api.setToken(null);
      renderGuest();
    }
  }

  function renderGuest() {
    document.getElementById('authArea').innerHTML = `
      <button class="btn btn-outline" onclick="Auth.openModal('login')">Log In</button>
      <button class="btn btn-primary" onclick="Auth.openModal('register')">Sign Up</button>
    `;
    document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'none');
  }

  function renderUser(user) {
    document.getElementById('authArea').innerHTML = `
      <div class="user-chip" onclick="Auth.openProfileModal()">
        <span class="user-avatar">${user.username[0].toUpperCase()}</span>
        <span class="user-name">${user.username}</span>
        <span class="user-pts">${user.stats?.points || 0} pts</span>
      </div>
      <button class="btn btn-ghost" onclick="Auth.doLogout()">Logout</button>
    `;
    document.querySelectorAll('.auth-only').forEach(el => el.style.display = '');
  }

  function openModal(tab = 'login') {
    document.getElementById('authModal').classList.add('open');
    switchAuthTab(tab);
  }

  function closeModal() {
    document.getElementById('authModal').classList.remove('open');
    clearAuthErrors();
  }

  function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('loginForm').style.display    = tab === 'login'    ? '' : 'none';
    document.getElementById('registerForm').style.display = tab === 'register' ? '' : 'none';
  }

  function clearAuthErrors() {
    document.querySelectorAll('.auth-error').forEach(el => el.textContent = '');
  }

  async function doLogin(e) {
    e.preventDefault();
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('loginError');
    errEl.textContent = '';
    try {
      const { token, user } = await api.login({ email, password });
      api.setToken(token);
      currentUser = user;
      renderUser(user);
      closeModal();
      showToast(`Welcome back, ${user.username}! ⚽`, 'success');
    } catch (err) {
      errEl.textContent = err.message;
    }
  }

  async function doRegister(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const errEl    = document.getElementById('registerError');
    errEl.textContent = '';
    try {
      const { token, user } = await api.register({ username, email, password });
      api.setToken(token);
      currentUser = user;
      renderUser(user);
      closeModal();
      showToast(`Welcome to GoalIQ, ${user.username}! 🎉`, 'success');
    } catch (err) {
      errEl.textContent = err.message;
    }
  }

  function doLogout() {
    api.logout();
    currentUser = null;
    renderGuest();
    showToast('Logged out successfully.');
  }

  function openProfileModal() {
    if (!currentUser) return;
    const modal = document.getElementById('profileModal');
    document.getElementById('profileUsername').textContent  = currentUser.username;
    document.getElementById('profileEmail').textContent     = currentUser.email || '';
    document.getElementById('profilePoints').textContent    = currentUser.stats?.points || 0;
    document.getElementById('profileCorrect').textContent   = currentUser.stats?.predictionsCorrect || 0;
    document.getElementById('profileTotal').textContent     = currentUser.stats?.predictionsTotal || 0;
    document.getElementById('profileStreak').textContent    = currentUser.stats?.streak || 0;
    const acc = currentUser.stats?.predictionsTotal
      ? Math.round((currentUser.stats.predictionsCorrect / currentUser.stats.predictionsTotal) * 100)
      : 0;
    document.getElementById('profileAccuracy').textContent = acc + '%';
    document.getElementById('profileAvatar').textContent   = currentUser.username[0].toUpperCase();
    modal.classList.add('open');
  }

  function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('open');
  }

  function getUser() { return currentUser; }

  return { init, openModal, closeModal, switchAuthTab, doLogin, doRegister, doLogout, openProfileModal, closeProfileModal, getUser };
})();
