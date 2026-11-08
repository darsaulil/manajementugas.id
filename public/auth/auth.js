
const form = document.querySelector('[data-auth-form]');
const message = document.querySelector('[data-auth-message]');

function readCookie(name) {
  const item = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`));

  return item
    ? decodeURIComponent(item.slice(name.length + 1))
    : null;
}

function showMessage(text, kind = '') {
  if (!message) return;

  message.textContent = text;
  message.className = `auth-message${kind ? ` is-${kind}` : ''}`;
}

async function requestJson(url, options = {}) {
  const headers = new Headers(options.headers ?? {});

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload.error?.message ?? 'Permintaan tidak dapat diproses.'
    );

    error.payload = payload;
    error.status = response.status;

    throw error;
  }

  return payload;
}

function formData(formElement) {
  return Object.fromEntries(new FormData(formElement).entries());
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const kind = form.dataset.authForm;
  const submit = form.querySelector('button[type="submit"]');

  if (submit) submit.disabled = true;

  showMessage('Memproses…');

  try {
    const values = formData(form);
    let payload;

    // REGISTRASI
    if (kind === 'register') {
      payload = await requestJson('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(values),
      });

      showMessage(
        'Akun berhasil dibuat. Mengarahkan ke dashboard…',
        'success'
      );

      form.reset();
      window.setTimeout(() => {
        window.location.assign(payload.data.redirectPath);
      }, 500);

      return;
    }

    // LOGIN
    if (kind === 'login') {
      payload = await requestJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          loginId: values.loginId,
          password: values.password,
        }),
      });

      showMessage(
        'Login berhasil. Mengarahkan ke ruang kerja…',
        'success'
      );

      window.setTimeout(() => {
        window.location.assign(payload.data.redirectPath);
      }, 250);

      return;
    }

    // LUPA PASSWORD
    if (kind === 'forgot') {
      payload = await requestJson('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(values),
      });

      showMessage(payload.data.message, 'success');
      form.reset();

      return;
    }

    // RESET PASSWORD
    if (kind === 'reset') {
      payload = await requestJson('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          token:
            new URLSearchParams(window.location.search).get('token') ??
            values.token,
        }),
      });

      showMessage(
        'Password berhasil diubah. Silakan login kembali.',
        'success'
      );

      window.setTimeout(() => {
        window.location.assign('/login');
      }, 700);

      return;
    }
  } catch (error) {
    const details = error.payload?.error?.details;
    const detailText = details
      ? Object.entries(details).map(([field, msg]) => `${field}: ${msg}`).join(' ')
      : '';
    showMessage(detailText ? `${error.message} ${detailText}` : error.message, 'error');
  } finally {
    if (submit) submit.disabled = false;
  }
});

// VERIFIKASI EMAIL
document
  .querySelector('[data-verify-email]')
  ?.addEventListener('click', async () => {
    showMessage('Memverifikasi email…');

    try {
      await requestJson(
        `/api/auth/verify-email?token=${encodeURIComponent(
          new URLSearchParams(window.location.search).get('token') ?? ''
        )}`
      );

      showMessage(
        'Email berhasil diverifikasi.',
        'success'
      );
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });

// LOGOUT
document
  .querySelector('[data-logout]')
  ?.addEventListener('click', async () => {
    const csrfToken = readCookie('mt_csrf');

    try {
      await requestJson('/api/auth/logout', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken ?? '',
        },
      });

      window.location.assign('/');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });

// INFORMASI PENGGUNA YANG SEDANG LOGIN
if (document.querySelector('[data-auth-user]')) {
  requestJson('/api/auth/me')
    .then((payload) => {
      const userElement = document.querySelector('[data-auth-user]');
      const user = payload.data.user;

      userElement.textContent =
        `${user.nickname} · ${user.loginId} · role ${user.role}`;
    })
    .catch(() => {
      window.location.assign('/login');
    });
}
