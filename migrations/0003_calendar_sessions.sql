-- Card 170 (Card 167 B2 + M2). Not deployed anywhere before this card.
-- Device sessions: a 1 h access handle + a rotating refresh handle (14 d idle, 90 d absolute
-- per family). One row per issued pair; a rotated row keeps its hash for reuse detection.
-- Only SHA-256 hashes are stored, never a handle.
create table if not exists calendar_session (
  id text primary key,
  connection_id text not null references calendar_connection(id) on delete cascade,
  family_id text not null,
  access_hash text not null unique,
  access_exp timestamptz not null,
  refresh_hash text not null unique,
  refresh_exp timestamptz not null,
  abs_exp timestamptz not null,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists calendar_session_family on calendar_session (family_id);

-- The old single long-lived sid becomes a refresh handle of its own family (expired access),
-- so a device that already holds one rotates onto the new scheme on its next request.
insert into calendar_session (id, connection_id, family_id, access_hash, access_exp, refresh_hash, refresh_exp, abs_exp)
select 'm-' || id, id, 'm-' || id, 'migrated-' || id, now(), sid_hash, now() + interval '14 days', now() + interval '90 days'
from calendar_connection
on conflict do nothing;
alter table calendar_connection drop column if exists sid_hash;

-- B2: server-issued hand-off (hid). The app holds the PKCE-style verifier, the browser shows a
-- 6-character code that the user types into the app. Only hashes of the code are stored.
drop table if exists calendar_handoff;
create table calendar_handoff (
  hid text primary key,
  challenge text not null,
  state text not null default 'started',
  ip_hash text,
  code_hash text,
  session_enc text,
  attempts integer not null default 0,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  final_at timestamptz
);
create index if not exists calendar_handoff_ip on calendar_handoff (ip_hash, created_at);
