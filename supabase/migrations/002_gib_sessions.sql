create table if not exists gib_sessions (
  gib_username text primary key,
  token        text not null,
  created_at   timestamptz default now()
);
