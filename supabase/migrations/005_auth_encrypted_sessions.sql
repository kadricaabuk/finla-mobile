-- Store GIB token encrypted-at-rest and add refresh-session storage.

alter table if exists gib_sessions
  alter column token drop not null;

alter table if exists gib_sessions
  add column if not exists token_enc text,
  add column if not exists token_iv text,
  add column if not exists token_tag text,
  add column if not exists key_version int default 1,
  add column if not exists updated_at timestamptz default now();

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  family_id uuid not null,
  refresh_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_auth_sessions_subject
  on auth_sessions (subject);

create index if not exists idx_auth_sessions_family
  on auth_sessions (family_id);

create index if not exists idx_auth_sessions_expires
  on auth_sessions (expires_at);
