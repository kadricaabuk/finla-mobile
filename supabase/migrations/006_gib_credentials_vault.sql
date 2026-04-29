alter table if exists gib_sessions
  add column if not exists cred_enc text,
  add column if not exists cred_iv text,
  add column if not exists cred_tag text,
  add column if not exists cred_key_version int default 1;
