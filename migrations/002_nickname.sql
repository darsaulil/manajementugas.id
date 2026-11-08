ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nickname VARCHAR(80);

DO $$
DECLARE
  user_record RECORD;
  base_nickname TEXT;
  candidate TEXT;
  suffix INTEGER;
  suffix_text TEXT;
BEGIN
  FOR user_record IN
    SELECT id, login_id
    FROM users
    WHERE nickname IS NULL OR btrim(nickname) = ''
    ORDER BY created_at ASC, id ASC
  LOOP
    base_nickname := initcap(
      regexp_replace(
        regexp_replace(user_record.login_id, '[._-]+', ' ', 'g'),
        '\\s+',
        ' ',
        'g'
      )
    );
    base_nickname := left(NULLIF(btrim(base_nickname), ''), 80);
    IF base_nickname IS NULL THEN
      base_nickname := 'Pengguna';
    END IF;

    candidate := base_nickname;
    suffix := 2;
    WHILE EXISTS (
      SELECT 1
      FROM users
      WHERE nickname IS NOT NULL
        AND LOWER(nickname) = LOWER(candidate)
        AND id <> user_record.id
    ) LOOP
      suffix_text := format(' (%s)', suffix);
      candidate := left(base_nickname, 80 - length(suffix_text)) || suffix_text;
      suffix := suffix + 1;
    END LOOP;

    UPDATE users
    SET nickname = candidate
    WHERE id = user_record.id;
  END LOOP;
END
$$;

ALTER TABLE users
  ALTER COLUMN nickname SET NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_nickname_not_blank_chk
  CHECK (length(btrim(nickname)) BETWEEN 2 AND 80);

CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_lower_uidx
  ON users (LOWER(nickname));
