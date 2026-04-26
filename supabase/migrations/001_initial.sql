create table if not exists conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  gib_username text not null,
  title       text not null default 'Yeni Sohbet'
);

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null
);

create index if not exists idx_conversations_username
  on conversations(gib_username, created_at desc);

create index if not exists idx_messages_conversation
  on messages(conversation_id, created_at asc);
