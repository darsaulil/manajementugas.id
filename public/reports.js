const root = document.documentElement;
const loading = document.querySelector('[data-loading]');
const errorState = document.querySelector('[data-error]');
const content = document.querySelector('[data-report-content]');
const feedback = document.querySelector('[data-feedback]');
const modeInput = document.querySelector('[data-report-mode]');
const dateInput = document.querySelector('[data-report-date]');
const monthInput = document.querySelector('[data-report-month]');
const themeToggle = document.querySelector('[data-theme-toggle]');
const userLabel = document.querySelector('[data-user-label]');
let currentRole = 'user';

function setTheme(theme) { const next = theme === 'dark' ? 'dark' : 'light'; root.dataset.theme = next; localStorage.setItem('manajementugas-theme', next); themeToggle?.setAttribute('aria-label', next === 'dark' ? 'Aktifkan light mode' : 'Aktifkan dark mode'); }
setTheme(localStorage.getItem('manajementugas-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeToggle?.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

function showFeedback(message, isError = false) { feedback.textContent = message; feedback.style.color = isError ? 'var(--danger)' : 'var(--success)'; }
async function api(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase(); const headers = new Headers(options.headers ?? {}); if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin' }); const body = await response.json().catch(() => null); if (response.status === 401) { window.location.href = '/login'; throw new Error('Sesi login diperlukan.'); } if (!response.ok) throw new Error(body?.error?.message ?? 'Permintaan gagal.'); return body;
}
function pad(value) { return String(value).padStart(2, '0'); }
function today() { const date = new Date(); return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; }
function currentMonth() { return today().slice(0, 7); }
function selectedValue() { return modeInput.value === 'monthly' ? monthInput.value : dateInput.value; }
function syncPeriodInputs() { const monthly = modeInput.value === 'monthly'; dateInput.parentElement.hidden = monthly; monthInput.parentElement.hidden = !monthly; }
function formatSnapshot(value) { return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)); }
function setStat(key, value, suffix = '') { const node = document.querySelector(`[data-stat="${key}"]`); if (node) node.textContent = `${value}${suffix}`; }

function renderChart(trend, mode) {
  const chart = document.querySelector('[data-report-chart]'); chart.replaceChildren(); if (!trend.length) { const empty = document.createElement('div'); empty.className = 'task-state report-chart-empty'; empty.textContent = 'Belum ada aktivitas pada periode ini.'; chart.append(empty); return; }
  const max = Math.max(...trend.flatMap((item) => [item.created, item.completed]), 1);
  trend.forEach((item) => { const group = document.createElement('div'); group.className = 'report-bar-group'; const bars = document.createElement('div'); bars.className = 'report-bars'; const created = document.createElement('span'); created.className = 'report-bar report-bar-created'; created.style.height = `${Math.max((item.created / max) * 100, item.created ? 2 : 0)}%`; created.title = `Dibuat: ${item.created}`; const completed = document.createElement('span'); completed.className = 'report-bar report-bar-completed'; completed.style.height = `${Math.max((item.completed / max) * 100, item.completed ? 2 : 0)}%`; completed.title = `Selesai: ${item.completed}`; bars.append(created, completed); const label = document.createElement('span'); label.className = 'report-bar-label'; const date = new Date(item.bucket); label.textContent = mode === 'daily' ? `${pad(date.getUTCHours())}:00` : `${date.getUTCDate()}/${date.getUTCMonth() + 1}`; group.append(bars, label); chart.append(group); });
}

function renderComparison(users, isOwner) {
  const panel = document.querySelector('[data-comparison-panel]'); const target = document.querySelector('[data-comparison]'); target.replaceChildren(); if (!isOwner) { panel.hidden = true; return; } if (!users.length) { panel.hidden = false; const empty = document.createElement('div'); empty.className = 'task-state'; empty.textContent = 'Belum ada data pengguna pada laporan ini.'; target.append(empty); return; }
  panel.hidden = false; const head = document.createElement('div'); head.className = 'report-table-row report-table-head'; ['Pengguna', 'Dibuat', 'Selesai', 'Persentase', 'Total task'].forEach((label) => { const node = document.createElement('span'); node.textContent = label; head.append(node); }); target.append(head);
  users.forEach((user) => { const row = document.createElement('div'); row.className = 'report-table-row'; const identity = document.createElement('strong'); identity.textContent = `${user.nickname || user.loginId} · ${user.loginId}${user.isActive ? '' : ' · nonaktif'}`; const created = document.createElement('strong'); created.textContent = user.createdInPeriod; const completed = document.createElement('strong'); completed.textContent = user.completedInPeriod; const percentage = document.createElement('strong'); percentage.textContent = `${user.periodCompletionPercentage}%`; const total = document.createElement('strong'); total.textContent = user.totalTasks; row.append(identity, created, completed, percentage, total); target.append(row); });
}

async function loadReport() {
  const value = selectedValue(); if (!value) return; loading.hidden = false; errorState.hidden = true; content.hidden = true; document.querySelector('[data-comparison-panel]').hidden = true;
  try { const body = await api(`/api/reports?mode=${encodeURIComponent(modeInput.value)}&value=${encodeURIComponent(value)}`); const report = body.data.report; const summary = report.summary; setStat('totalTasks', summary.totalTasks); setStat('createdInPeriod', summary.createdInPeriod); setStat('completedInPeriod', summary.completedInPeriod); setStat('periodCompletionPercentage', summary.periodCompletionPercentage, '%'); setStat('completedTasks', summary.completedTasks); setStat('urgentTasks', summary.urgentTasks); setStat('overdueTasks', summary.overdueTasks); document.querySelector('[data-snapshot]').textContent = `Snapshot UTC: ${formatSnapshot(summary.snapshotAt)} · Periode: ${report.period.label}`; document.querySelector('[data-report-label]').textContent = `Aktivitas ${report.period.label}`; renderChart(report.trend, report.period.mode); renderComparison(report.comparison, currentRole === 'owner'); content.hidden = false; loading.hidden = true; showFeedback('Laporan diperbarui dari database.'); } catch (error) { loading.hidden = true; errorState.hidden = false; errorState.textContent = error.message; showFeedback('Laporan gagal dimuat.', true); }
}

modeInput.addEventListener('change', () => { syncPeriodInputs(); });
document.querySelector('[data-apply-report]').addEventListener('click', loadReport);
document.querySelector('[data-logout]').addEventListener('click', async () => { try { const csrf = await fetch('/api/auth/csrf', { credentials: 'same-origin' }); const csrfBody = await csrf.json().catch(() => null); await api('/api/auth/logout', { method: 'POST', headers: csrfBody?.data?.csrfToken ? { 'X-CSRF-Token': csrfBody.data.csrfToken } : {} }); } finally { window.location.href = '/'; } });

dateInput.value = today(); monthInput.value = currentMonth(); syncPeriodInputs();
try { const me = await api('/api/auth/me'); currentRole = me.data.user.role; userLabel.textContent = `${me.data.user.nickname} · ${me.data.user.loginId} · ${currentRole === 'owner' ? 'Owner' : 'User'}`; if (currentRole === 'owner') document.querySelector('.reports-nav a').href = '/owner/dashboard'; } catch { /* redirect handled by api */ }
await loadReport();
