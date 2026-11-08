const root = document.documentElement;
const feedback = document.querySelector('[data-feedback]');
const themeToggle = document.querySelector('[data-theme-toggle]');
const themeAction = document.querySelector('[data-theme-action]');
const userLabel = document.querySelector('[data-user-label]');

function applyTheme(theme) { const next = theme === 'dark' ? 'dark' : 'light'; root.dataset.theme = next; localStorage.setItem('manajementugas-theme', next); const label = next === 'dark' ? 'Aktifkan light mode' : 'Aktifkan dark mode'; themeToggle?.setAttribute('aria-label', label); themeToggle?.setAttribute('title', label); if (themeAction) themeAction.textContent = label; }
applyTheme(localStorage.getItem('manajementugas-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeToggle?.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
themeAction?.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

function showFeedback(message, isError = false) { feedback.textContent = message; feedback.style.color = isError ? 'var(--danger)' : 'var(--success)'; }
function setFormMessage(selector, message) { const node = document.querySelector(selector); node.textContent = message; }
async function api(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase(); const headers = new Headers(options.headers ?? {}); if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) { const csrf = await fetch('/api/auth/csrf', { credentials: 'same-origin' }); const csrfBody = await csrf.json().catch(() => null); if (csrf.ok && csrfBody?.data?.csrfToken) headers.set('X-CSRF-Token', csrfBody.data.csrfToken); }
  const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin' }); const body = await response.json().catch(() => null); if (response.status === 401) { window.location.href = '/login'; throw new Error('Sesi login diperlukan.'); } if (!response.ok) throw new Error(body?.error?.message ?? 'Permintaan gagal.'); return body;
}

async function loadProfile() { const body = await api('/api/account/me'); const user = body.data.user; document.querySelector('[data-nickname]').value = user.nickname; document.querySelector('[data-nickname-form] [name="nickname"]').value = user.nickname; document.querySelector('[data-login-id]').value = user.loginId; document.querySelector('[data-email]').value = user.email; document.querySelector('[data-role]').value = user.role === 'owner' ? 'Owner' : 'User'; document.querySelector('[data-verification]').value = user.emailVerified ? 'Terverifikasi' : 'Belum terverifikasi'; userLabel.textContent = `${user.nickname} · ${user.role === 'owner' ? 'Owner' : 'User'}`; if (user.role === 'owner') document.querySelector('[data-dashboard-link]').href = '/owner/dashboard'; }

document.querySelector('[data-nickname-form]').addEventListener('submit', async (event) => { event.preventDefault(); setFormMessage('[data-nickname-feedback]', 'Menyimpan…'); const form = new FormData(event.currentTarget); try { await api('/api/account/nickname', { method: 'POST', body: JSON.stringify({ nickname: form.get('nickname') }) }); setFormMessage('[data-nickname-feedback]', ''); showFeedback('Nickname berhasil diperbarui.'); await loadProfile(); } catch (error) { setFormMessage('[data-nickname-feedback]', error.message); } });

document.querySelector('[data-password-form]').addEventListener('submit', async (event) => { event.preventDefault(); const formEl = event.currentTarget; setFormMessage('[data-password-feedback]', 'Menyimpan…'); const form = new FormData(formEl); try { await api('/api/account/password', { method: 'POST', body: JSON.stringify({ currentPassword: form.get('currentPassword'), password: form.get('password'), passwordConfirmation: form.get('passwordConfirmation') }) }); formEl.reset(); setFormMessage('[data-password-feedback]', ''); showFeedback('Password berhasil diperbarui. Session lain telah dicabut.'); } catch (error) { setFormMessage('[data-password-feedback]', error.message); } });

document.querySelector('[data-email-form]').addEventListener('submit', async (event) => { event.preventDefault(); const formEl = event.currentTarget; setFormMessage('[data-email-feedback]', 'Menyimpan…'); const form = new FormData(formEl); try { const body = await api('/api/account/email', { method: 'POST', body: JSON.stringify({ newEmail: form.get('newEmail'), currentPassword: form.get('currentPassword') }) }); formEl.reset(); setFormMessage('[data-email-feedback]', ''); showFeedback(body.data.emailDelivery === 'disabled' ? 'Email berubah, tetapi provider email belum aktif sehingga tautan verifikasi belum dikirim.' : 'Email berubah. Periksa inbox untuk verifikasi ulang.'); await loadProfile(); } catch (error) { setFormMessage('[data-email-feedback]', error.message); } });

document.querySelector('[data-logout]').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/'; } });
try { await loadProfile(); } catch { /* redirect handled by api */ }
