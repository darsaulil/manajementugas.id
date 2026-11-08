CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login_id VARCHAR(32) NOT NULL UNIQUE,
  email VARCHAR(320) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user',
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_login_id_format_chk CHECK (login_id ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  CONSTRAINT users_role_chk CHECK (role IN ('owner', 'user')),
  CONSTRAINT users_active_deactivated_chk CHECK (
    (is_active = TRUE AND deactivated_at IS NULL)
    OR (is_active = FALSE AND deactivated_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email));
CREATE INDEX users_role_active_idx ON users (role, is_active);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  task_type VARCHAR(16) NOT NULL DEFAULT 'biasa',
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  deadline TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tasks_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT tasks_title_not_blank_chk CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT tasks_description_length_chk CHECK (description IS NULL OR length(description) <= 5000),
  CONSTRAINT tasks_type_chk CHECK (task_type IN ('biasa', 'ribet', 'prioritas')),
  CONSTRAINT tasks_status_chk CHECK (status IN ('pending', 'completed')),
  CONSTRAINT tasks_completion_consistency_chk CHECK (
    (status = 'pending' AND completed_at IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX tasks_owner_created_idx ON tasks (owner_id, created_at DESC);
CREATE INDEX tasks_owner_status_deadline_idx ON tasks (owner_id, status, deadline);
CREATE INDEX tasks_overdue_pending_idx ON tasks (owner_id, deadline)
  WHERE status = 'pending';

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_verification_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX email_verification_tokens_user_idx ON email_verification_tokens (user_id);
CREATE INDEX email_verification_tokens_expiry_idx ON email_verification_tokens (expires_at)
  WHERE used_at IS NULL;

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT password_reset_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);
CREATE INDEX password_reset_tokens_expiry_idx ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

CREATE TABLE sessions (
  session_id_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tasks_set_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
