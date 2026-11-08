export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function normalizeLoginId(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function validateLoginId(loginId) {
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(loginId)) {
    return 'ID harus 3–32 karakter lowercase dan hanya boleh berisi huruf, angka, titik, underscore, atau tanda hubung.';
  }
  return null;
}

export function validateEmail(email) {
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Email tidak valid.';
  }
  return null;
}

export function validatePassword(password) {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `Password harus ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} karakter.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Password harus memiliki huruf besar, huruf kecil, angka, dan simbol.';
  }
  return null;
}



export function validatePasswordInput(input) {
  const password = String(input.password ?? '');
  const passwordConfirmation = String(input.passwordConfirmation ?? '');
  const errors = {};
  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (password !== passwordConfirmation) errors.passwordConfirmation = 'Konfirmasi password tidak cocok.';
  return { password, passwordConfirmation, errors };
}

export function validateRegistrationInput(input) {
  const loginId = normalizeLoginId(input.loginId);
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? '');
  const passwordConfirmation = String(input.passwordConfirmation ?? '');

  const errors = {};

  const loginError = validateLoginId(loginId);
  if (loginError) errors.loginId = loginError;

  if (email) {
    const emailError = validateEmail(email);
    if (emailError) errors.email = emailError;
  }

  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;

  if (password !== passwordConfirmation) {
    errors.passwordConfirmation = 'Konfirmasi password tidak cocok.';
  }

  return {
    loginId,
    email: email || null,
    password,
    passwordConfirmation,
    errors,
  };
}