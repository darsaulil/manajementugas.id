export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 80;

export function normalizeNickname(value) {
  return String(value ?? '').trim().replace(/\s+/gu, ' ');
}

export function validateNickname(value) {
  const nickname = normalizeNickname(value);
  if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
    return `Nickname harus ${NICKNAME_MIN_LENGTH}–${NICKNAME_MAX_LENGTH} karakter.`;
  }
  if (/[\u0000-\u001F\u007F]/u.test(nickname)) {
    return 'Nickname mengandung karakter yang tidak valid.';
  }
  return null;
}

export function nicknameFromLoginId(loginId) {
  const words = String(loginId ?? '')
    .trim()
    .split(/[._-]+/u)
    .filter(Boolean);
  const nickname = words
    .map((word) => `${word.slice(0, 1).toLocaleUpperCase('id-ID')}${word.slice(1)}`)
    .join(' ')
    .trim();
  return nickname.slice(0, NICKNAME_MAX_LENGTH) || 'Pengguna';
}

function withSuffix(base, suffix) {
  const suffixText = ` (${suffix})`;
  return `${base.slice(0, NICKNAME_MAX_LENGTH - suffixText.length).trimEnd()}${suffixText}`;
}

export async function createAvailableNickname(client, loginId) {
  const base = nicknameFromLoginId(loginId);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const result = await client.query(
      'SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) LIMIT 1',
      [candidate],
    );
    if (result.rowCount === 0) return candidate;
    candidate = withSuffix(base, suffix);
    suffix += 1;
  }
}

export async function nicknameTaken(client, nickname, userId) {
  const result = await client.query(
    'SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($1) AND id <> $2 LIMIT 1',
    [nickname, userId],
  );
  return result.rowCount > 0;
}
