-- Phone + password auth; Mysoft tenant linking

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  vkn_tckn text not null unique,
  display_name text,
  mysoft_status text not null default 'mock_linked',
  created_at timestamptz not null default now()
);

create table if not exists user_tenants (
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  role text not null default 'owner',
  primary key (user_id, tenant_id)
);

create table if not exists otp_challenges (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  purpose text not null check (purpose in ('register', 'reset_password')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_otp_challenges_phone_purpose
  on otp_challenges(phone, purpose, created_at desc);

create index if not exists idx_user_tenants_user
  on user_tenants(user_id);

alter table conversations
  add column if not exists user_id uuid references users(id) on delete cascade;

alter table conversations
  alter column gib_username drop not null;

create index if not exists idx_conversations_user_id
  on conversations(user_id, created_at desc);

alter table invoice_facts
  add column if not exists user_id uuid references users(id) on delete cascade;

alter table invoice_facts
  add column if not exists tenant_vkn text;

create index if not exists idx_invoice_facts_user_id
  on invoice_facts(user_id, issue_date desc);
