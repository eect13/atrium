-- Card 165: Google calendar connections (separate from sign-in, Card 163 option 3b).
-- The device session secret is never stored: only its SHA-256 (sid_hash).
-- The Google refresh token is stored sealed with AES-256-GCM (CALENDAR_TOKEN_ENC_KEY).
create table if not exists calendar_connection (
  id text primary key,
  sid_hash text not null unique,
  provider text not null default 'google',
  account_sub text,
  account_email text,
  refresh_token_enc text not null,
  scopes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Desktop / Android hand-off: the browser finishes OAuth, the app claims the session once
-- with the PKCE verifier that only it holds. Rows expire after 10 minutes.
create table if not exists calendar_handoff (
  challenge text primary key,
  sid_enc text,
  expires_at timestamptz not null,
  claimed_at timestamptz
);
