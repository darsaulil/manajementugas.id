const root = document.documentElement;
const taskList = document.querySelector('[data-task-list]');
const loading = document.querySelector('[data-loading]');
const empty = document.querySelector('[data-empty]');
const errorState = document.querySelector('[data-error]');
const feedback = document.querySelector('[data-feedback]');
const taskDialog = document.querySelector('[data-task-dialog]');
const deleteDialog = document.querySelector('[data-delete-dialog]');
const taskForm = document.querySelector('[data-task-form]');
const formFeedback = document.querySelector('[data-form-feedback]');
const formStatus = document.querySelector('[data-form-status]');
const userLabel = document.querySelector('[data-user-label]');
const themeToggle = document.querySelector('[data-theme-toggle]');

let editingId = null;
let deleteId = null;
let filterTimer = null;

const taskTypeLabels = { biasa: 'Biasa', ribet: 'Ribet', prioritas: 'Prioritas' };
const statusLabels = { pending: 'Belum selesai', completed: 'Selesai' };

// Hamburger menu logic for mobile dashboard
const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');
if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi');
  });

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Buka menu navigasi');
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navMenu.classList.contains('is-open')) {
      navMenu.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Buka menu navigasi');
      navToggle?.focus();
    }
  });
}

function setTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  root.dataset.theme = nextTheme;
  localStorage.setItem('manajementugas-theme', nextTheme);
  const dark = nextTheme === 'dark';
  themeToggle?.setAttribute('aria-label', dark ? 'Aktifkan light mode' : 'Aktifkan dark mode');
  themeToggle?.setAttribute('title', dark ? 'Aktifkan light mode' : 'Aktifkan dark mode');
}

setTheme(localStorage.getItem('manajementugas-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeToggle?.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.style.color = isError ? 'var(--danger)' : 'var(--success)';
  window.clearTimeout(showFeedback.timeout);
  if (message) showFeedback.timeout = window.setTimeout(() => { feedback.textContent = ''; }, 4200);
}

function setFormFeedback(message) {
  formFeedback.textContent = message;
  formFeedback.classList.toggle('is-error', Boolean(message));
}

async function requestJson(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers ?? {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    const csrfBody = await csrfResponse.json().catch(() => null);
    if (csrfResponse.ok && csrfBody?.data?.csrfToken) headers.set('X-CSRF-Token', csrfBody.data.csrfToken);
  }
  const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin' });
  const body = await response.json().catch(() => null);
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Sesi login diperlukan.');
  }
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? 'Permintaan gagal.');
    error.details = body?.error?.details;
    error.status = response.status;
    throw error;
  }
  return body;
}

function formatDeadline(task) {
  const formatted = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(task.deadline));
  if (task.isOverdue) return `Kedaluwarsa · ${formatted}`;
  if (task.status === 'completed') return `Selesai · ${formatted}`;
  const seconds = Math.max(0, task.secondsToDeadline);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const remaining = days > 0 ? `${days} hari lagi` : `${Math.max(hours, 1)} jam lagi`;
  return `${remaining} · ${formatted}`;
}

function createBadge(text, className = '') {
  const badge = document.createElement('span');
  badge.className = `task-badge ${className}`.trim();
  badge.textContent = text;
  return badge;
}

function renderTasks(tasks) {
  window.currentTasks = tasks;
  taskList.replaceChildren();
  tasks.forEach((task) => {
    const card = document.createElement('article');
    card.className = `task-card${task.isOverdue ? ' is-overdue' : ''}${task.status === 'completed' ? ' is-completed' : ''}`;
    card.dataset.taskId = task.id;

    const head = document.createElement('div');
    head.className = 'task-card-head';
    const titleWrap = document.createElement('div');
    const kicker = document.createElement('p');
    kicker.className = 'eyebrow';
    kicker.textContent = task.ownerNickname ? `Pemilik: ${task.ownerNickname}` : (task.ownerLoginId ? `Pemilik: ${task.ownerLoginId}` : 'Tugas');
    const title = document.createElement('h2');
    title.className = `task-card-title${task.status === 'completed' ? ' is-completed' : ''}`;
    title.textContent = task.title;
    titleWrap.append(kicker, title);
    const badges = document.createElement('div');
    badges.className = 'task-badges';
    badges.append(createBadge(taskTypeLabels[task.taskType] ?? task.taskType, task.taskType === 'prioritas' ? 'task-badge-prioritas' : ''));
    badges.append(createBadge(statusLabels[task.status], task.status === 'completed' ? 'task-badge-completed' : ''));
    if (task.isUrgent) badges.append(createBadge('Mendesak', 'task-badge-urgent'));
    if (task.isOverdue) badges.append(createBadge('Kedaluwarsa', 'task-badge-overdue'));
    head.append(titleWrap, badges);

    const description = document.createElement('p');
    description.className = 'task-card-description';
    description.textContent = task.description || 'Tidak ada deskripsi.';

    const footer = document.createElement('div');
    footer.className = 'task-card-footer';
    const meta = document.createElement('span');
    meta.className = 'task-card-meta';
    meta.textContent = formatDeadline(task);
    const actions = document.createElement('div');
    actions.className = 'task-card-actions';
    const toggle = document.createElement('button');
    toggle.className = 'button button-ghost button-small';
    toggle.type = 'button';
    toggle.dataset.action = 'toggle';
    toggle.textContent = task.status === 'completed' ? 'Tandai belum selesai' : 'Tandai selesai';
    const edit = document.createElement('button');
    edit.className = 'button button-ghost button-small';
    edit.type = 'button';
    edit.dataset.action = 'edit';
    edit.textContent = 'Edit';
    const remove = document.createElement('button');
    remove.className = 'button button-danger button-small';
    remove.type = 'button';
    remove.dataset.action = 'delete';
    remove.textContent = 'Hapus';
    actions.append(toggle, edit, remove);
    footer.append(meta, actions);
    card.append(head, description, footer);
    taskList.append(card);
  });
}

function queryString() {
  const params = new URLSearchParams();
  const values = [
    ['search', document.querySelector('[data-filter-search]').value.trim()],
    ['taskType', document.querySelector('[data-filter-type]').value],
    ['status', document.querySelector('[data-filter-status]').value],
    ['flag', document.querySelector('[data-filter-flag]').value],
  ];
  values.forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.toString();
}

async function loadTasks() {
  loading.hidden = false;
  empty.hidden = true;
  errorState.hidden = true;
  try {
    const suffix = queryString();
    const [taskBody, summaryBody] = await Promise.all([
      requestJson(`/api/tasks${suffix ? `?${suffix}` : ''}`),
      requestJson('/api/tasks/summary'),
    ]);
    renderTasks(taskBody.data.tasks);
    const summary = summaryBody.data.summary;
    Object.entries(summary).forEach(([key, value]) => {
      const element = document.querySelector(`[data-stat="${key}"]`);
      if (element) element.textContent = key === 'completion_percentage' || key === 'completionPercentage' ? `${value}%` : value;
    });
    document.querySelector('[data-stat="completionPercentage"]').textContent = `${summary.completion_percentage}%`;
    loading.hidden = true;
    empty.hidden = taskBody.data.tasks.length !== 0;
  } catch (error) {
    loading.hidden = true;
    errorState.hidden = false;
    errorState.textContent = error.message;
  }
}

async function loadSession() {
  try {
    const body = await requestJson('/api/auth/me');
    userLabel.textContent = `${body.data.user.nickname} · ${body.data.user.loginId} · ${body.data.user.role === 'owner' ? 'Owner' : 'User'}`;
  } catch {
    // requestJson redirects anonymous users.
  }
}

function toLocalInput(isoDate) {
  const date = new Date(isoDate);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function openForm(task = null) {
  editingId = task?.id ?? null;
  taskForm.reset();
  setFormFeedback('');
  document.querySelector('[data-form-kicker]').textContent = task ? 'Edit tugas' : 'Tugas baru';
  document.querySelector('[data-form-title]').textContent = task ? 'Perbarui tugas' : 'Tambah tugas';
  document.querySelector('[data-submit-task]').textContent = task ? 'Simpan perubahan' : 'Simpan tugas';
  formStatus.hidden = !task;
  if (task) {
    taskForm.elements.title.value = task.title;
    taskForm.elements.description.value = task.description ?? '';
    taskForm.elements.taskType.value = task.taskType;
    taskForm.elements.deadline.value = toLocalInput(task.deadline);
    taskForm.elements.status.value = task.status;
  } else {
    taskForm.elements.deadline.value = toLocalInput(new Date(Date.now() + 86400000).toISOString());
  }
  taskDialog.showModal();
  taskForm.elements.title.focus();
}

function closeForm() { taskDialog.close(); }

async function saveTask(event) {
  event.preventDefault();
  setFormFeedback('Menyimpan…');
  const form = new FormData(taskForm);
  const payload = {
    title: form.get('title'),
    description: form.get('description') || null,
    taskType: form.get('taskType'),
    deadline: new Date(form.get('deadline')).toISOString(),
  };
  if (editingId) payload.status = form.get('status');
  try {
    await requestJson(editingId ? `/api/tasks/${editingId}` : '/api/tasks', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    closeForm();
    showFeedback(editingId ? 'Tugas berhasil diperbarui.' : 'Tugas berhasil ditambahkan.');
    await loadTasks();
  } catch (error) {
    setFormFeedback(error.message);
  }
}

async function toggleTask(taskId, currentStatus) {
  try {
    await requestJson(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status: currentStatus === 'completed' ? 'pending' : 'completed' }) });
    showFeedback('Status tugas berhasil diperbarui.');
    await loadTasks();
  } catch (error) { showFeedback(error.message, true); }
}

function askDelete(taskId) { deleteId = taskId; deleteDialog.showModal(); }

async function confirmDelete() {
  if (!deleteId) return;
  try {
    await requestJson(`/api/tasks/${deleteId}`, { method: 'DELETE' });
    deleteDialog.close();
    deleteId = null;
    showFeedback('Tugas berhasil dihapus.');
    await loadTasks();
  } catch (error) { showFeedback(error.message, true); }
}

taskList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const card = button.closest('[data-task-id]');
  const task = window.currentTasks?.find((item) => item.id === card.dataset.taskId);
  if (!task) return;
  if (button.dataset.action === 'edit') openForm(task);
  if (button.dataset.action === 'delete') askDelete(task.id);
  if (button.dataset.action === 'toggle') toggleTask(task.id, task.status);
});

window.currentTasks = [];

document.querySelector('[data-open-task-form]').addEventListener('click', () => openForm());
document.querySelectorAll('[data-close-task-form]').forEach((button) => button.addEventListener('click', closeForm));
document.querySelector('[data-cancel-delete]').addEventListener('click', () => deleteDialog.close());
document.querySelector('[data-confirm-delete]').addEventListener('click', confirmDelete);
document.querySelector('[data-logout]').addEventListener('click', async () => {
  try { await requestJson('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/'; }
});
taskForm.addEventListener('submit', saveTask);

document.querySelectorAll('[data-filter-search], [data-filter-type], [data-filter-status], [data-filter-flag]').forEach((element) => {
  element.addEventListener(element.type === 'search' ? 'input' : 'change', () => {
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(loadTasks, 250);
  });
});
document.querySelector('[data-reset-filters]').addEventListener('click', () => {
  document.querySelector('[data-filter-search]').value = '';
  document.querySelector('[data-filter-type]').value = '';
  document.querySelector('[data-filter-status]').value = '';
  document.querySelector('[data-filter-flag]').value = '';
  loadTasks();
});

await loadSession();
await loadTasks();
