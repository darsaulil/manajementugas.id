const root = document.documentElement;
const loading = document.querySelector('[data-loading]');
const errorState = document.querySelector('[data-error]');
const stats = document.querySelector('[data-stats]');
const userList = document.querySelector('[data-user-list]');
const chart = document.querySelector('[data-user-chart]');
const feedback = document.querySelector('[data-feedback]');
const userDialog = document.querySelector('[data-user-dialog]');
const detailBody = document.querySelector('[data-detail-body]');
const userLabel = document.querySelector('[data-user-label]');
const themeToggle = document.querySelector('[data-theme-toggle]');
let filterTimer;

function setTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  root.dataset.theme = next;
  localStorage.setItem('manajementugas-theme', next);
  themeToggle?.setAttribute('aria-label', next === 'dark' ? 'Aktifkan light mode' : 'Aktifkan dark mode');
}
setTheme(localStorage.getItem('manajementugas-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeToggle?.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

// Hamburger menu logic for owner dashboard mobile
const ownerNavToggle = document.querySelector('.nav-toggle');
const ownerNavMenu = document.querySelector('.nav-menu');
if (ownerNavToggle && ownerNavMenu) {
  ownerNavToggle.addEventListener('click', () => {
    const isOpen = ownerNavMenu.classList.toggle('is-open');
    ownerNavToggle.setAttribute('aria-expanded', String(isOpen));
    ownerNavToggle.setAttribute('aria-label', isOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi');
  });

  ownerNavMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      ownerNavMenu.classList.remove('is-open');
      ownerNavToggle.setAttribute('aria-expanded', 'false');
      ownerNavToggle.setAttribute('aria-label', 'Buka menu navigasi');
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ownerNavMenu.classList.contains('is-open')) {
      ownerNavMenu.classList.remove('is-open');
      ownerNavToggle.setAttribute('aria-expanded', 'false');
      ownerNavToggle.setAttribute('aria-label', 'Buka menu navigasi');
      ownerNavToggle?.focus();
    }
  });
}

function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.style.color = isError ? 'var(--danger)' : 'var(--success)';
  window.clearTimeout(showFeedback.timeout);
  if (message) showFeedback.timeout = window.setTimeout(() => { feedback.textContent = ''; }, 4000);
}

async function api(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers ?? {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
    const csrf = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    const csrfBody = await csrf.json().catch(() => null);
    if (csrf.ok && csrfBody?.data?.csrfToken) headers.set('X-CSRF-Token', csrfBody.data.csrfToken);
  }
  const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin' });
  const body = await response.json().catch(() => null);
  if (response.status === 401) { window.location.href = '/login'; throw new Error('Sesi login diperlukan.'); }
  if (!response.ok) throw new Error(body?.error?.message ?? 'Permintaan gagal.');
  return body;
}

function metric(label, value) {
  const card = document.createElement('div');
  card.className = 'owner-detail-metric';
  const caption = document.createElement('span');
  caption.textContent = label;
  const number = document.createElement('strong');
  number.textContent = value;
  card.append(caption, number);
  return card;
}

function renderChart(users) {
  chart.replaceChildren();
  if (!users.length) { const state = document.createElement('div'); state.className = 'task-state'; state.textContent = 'Belum ada data pengguna yang cocok.'; chart.append(state); return; }
  const max = Math.max(...users.map((user) => user.totalTasks), 1);
  users.forEach((user) => {
    const row = document.createElement('div'); row.className = 'owner-chart-row';
    const label = document.createElement('span'); label.className = 'owner-chart-label'; label.textContent = user.nickname || user.loginId;
    const track = document.createElement('span'); track.className = 'owner-chart-track';
    const bar = document.createElement('span'); bar.className = 'owner-chart-bar'; bar.style.width = `${Math.max((user.totalTasks / max) * 100, user.totalTasks ? 3 : 0)}%`; track.append(bar);
    const value = document.createElement('span'); value.className = 'owner-chart-value'; value.textContent = `${user.totalTasks} tugas`;
    row.append(label, track, value); chart.append(row);
  });
}

function userMetric(label, value) { const wrapper = document.createElement('div'); wrapper.className = 'owner-user-metric'; const caption = document.createElement('span'); caption.textContent = label; const valueNode = document.createElement('strong'); valueNode.textContent = value; wrapper.append(caption, valueNode); return wrapper; }

function renderUsers(users) {
  userList.replaceChildren();
  if (!users.length) { const state = document.createElement('div'); state.className = 'task-state'; state.textContent = 'Tidak ada pengguna yang cocok.'; userList.append(state); return; }
  users.forEach((user) => {
    const row = document.createElement('article'); row.className = 'owner-user-row'; row.dataset.userId = user.id;
    const identity = document.createElement('div'); identity.className = 'owner-user-name'; const name = document.createElement('strong'); name.textContent = user.nickname || user.loginId; const login = document.createElement('small'); login.textContent = `ID login: ${user.loginId}`; const email = document.createElement('small'); email.textContent = user.email; const badge = document.createElement('span'); badge.className = `owner-badge ${user.isActive ? '' : 'owner-badge-inactive'} ${user.role === 'owner' ? 'owner-badge-owner' : ''}`; badge.textContent = `${user.role === 'owner' ? 'Owner' : 'User'} · ${user.isActive ? 'Aktif' : 'Nonaktif'}`; identity.append(name, login, email, badge);
    const total = userMetric('Total', user.totalTasks); const completed = userMetric('Selesai', user.completedTasks); const pending = userMetric('Pending', user.pendingTasks); const percentage = userMetric('Selesai %', `${user.completionPercentage}%`);
    const actions = document.createElement('div'); actions.className = 'owner-user-actions'; const detail = document.createElement('button'); detail.className = 'button button-ghost button-small'; detail.type = 'button'; detail.dataset.action = 'detail'; detail.textContent = 'Detail'; const toggle = document.createElement('button'); toggle.className = 'button button-small'; toggle.type = 'button'; toggle.dataset.action = 'status'; toggle.textContent = user.isActive ? 'Nonaktifkan' : 'Aktifkan'; if (user.isActive) toggle.classList.add('button-danger'); else toggle.classList.add('button-primary'); actions.append(detail, toggle);
    row.append(identity, total, completed, pending, percentage, actions); userList.append(row);
  });
}

async function loadOverview() {
  loading.hidden = false; errorState.hidden = true; stats.hidden = true;
  const params = new URLSearchParams({ search: document.querySelector('[data-user-search]').value.trim(), status: document.querySelector('[data-user-status]').value });
  try {
    const body = await api(`/api/owner/overview?${params}`);
    const overview = body.data.overview;
    const values = { totalUsers: overview.users.total_users, activeUsers: overview.users.active_users, inactiveUsers: overview.users.inactive_users, totalTasks: overview.tasks.total_tasks, completedTasks: overview.tasks.completed_tasks, pendingTasks: overview.tasks.pending_tasks, urgentTasks: overview.tasks.urgent_tasks, overdueTasks: overview.tasks.overdue_tasks, completionPercentage: `${overview.tasks.completion_percentage}%` };
    Object.entries(values).forEach(([key, value]) => { const node = document.querySelector(`[data-stat="${key}"]`); if (node) node.textContent = value; });
    renderChart(overview.userSummaries); renderUsers(overview.userSummaries); stats.hidden = false; loading.hidden = true;
  } catch (error) { loading.hidden = true; errorState.hidden = false; errorState.textContent = error.message; }
}

async function openDetail(userId) {
  detailBody.replaceChildren();
  const loadingNode = document.createElement('div'); loadingNode.className = 'task-state'; loadingNode.textContent = 'Memuat detail pengguna…'; detailBody.append(loadingNode); userDialog.showModal();
  try {
    const body = await api(`/api/owner/users/${userId}`); const { user, tasks } = body.data; document.querySelector('[data-detail-title]').textContent = user.nickname || user.loginId; detailBody.replaceChildren();
    const meta = document.createElement('p'); meta.className = 'task-card-meta'; meta.textContent = `ID login: ${user.loginId} · ${user.email} · ${user.isActive ? 'Akun aktif' : 'Akun nonaktif'} · ${user.emailVerified ? 'Email terverifikasi' : 'Email belum terverifikasi'}`;
    const summary = document.createElement('div'); summary.className = 'owner-detail-summary'; summary.append(metric('Total task', user.totalTasks), metric('Selesai', user.completedTasks), metric('Selesai %', `${user.completionPercentage}%`));
    const title = document.createElement('p'); title.className = 'eyebrow'; title.textContent = 'Task terbaru'; const list = document.createElement('div'); list.className = 'owner-detail-tasks';
    if (!tasks.length) { const empty = document.createElement('div'); empty.className = 'task-state'; empty.textContent = 'Pengguna ini belum memiliki task.'; list.append(empty); } else tasks.forEach((task) => { const item = document.createElement('div'); item.className = 'owner-detail-task'; const taskTitle = document.createElement('strong'); taskTitle.textContent = task.title; const taskMeta = document.createElement('small'); taskMeta.textContent = `${task.status === 'completed' ? 'Selesai' : 'Pending'} · ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(task.deadline))}`; item.append(taskTitle, taskMeta); list.append(item); });
    detailBody.append(meta, summary, title, list);
  } catch (error) { detailBody.replaceChildren(); const errorNode = document.createElement('div'); errorNode.className = 'task-state task-state-error'; errorNode.textContent = error.message; detailBody.append(errorNode); }
}

userList.addEventListener('click', async (event) => { const button = event.target.closest('button[data-action]'); if (!button) return; const row = button.closest('[data-user-id]'); const userId = row.dataset.userId; if (button.dataset.action === 'detail') { await openDetail(userId); return; } const isActive = button.textContent === 'Nonaktifkan'; if (!window.confirm(isActive ? 'Nonaktifkan akun ini? Session aktif akan dicabut, tetapi task tetap dipertahankan.' : 'Aktifkan akun ini kembali?')) return; try { await api(`/api/owner/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !isActive }) }); showFeedback(isActive ? 'Akun dinonaktifkan dan session aktif dicabut.' : 'Akun diaktifkan kembali.'); await loadOverview(); } catch (error) { showFeedback(error.message, true); } });

document.querySelector('[data-close-detail]').addEventListener('click', () => userDialog.close());
document.querySelector('[data-logout]').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/'; } });
document.querySelectorAll('[data-user-search], [data-user-status]').forEach((element) => element.addEventListener(element.type === 'search' ? 'input' : 'change', () => { window.clearTimeout(filterTimer); filterTimer = window.setTimeout(loadOverview, 250); }));

try { const me = await api('/api/auth/me'); userLabel.textContent = `${me.data.user.nickname} · ${me.data.user.loginId} · Owner`; } catch { /* redirect handled by api */ }
await loadOverview();
