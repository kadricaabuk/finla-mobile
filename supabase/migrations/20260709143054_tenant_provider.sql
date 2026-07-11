-- Per-tenant e-document provider selection (Mysoft/Nilvera swap, CRM-controlled).
alter table tenants
  add column if not exists provider text not null default 'mysoft'
    check (provider in ('mysoft', 'nilvera')),
  add column if not exists provider_status text;

-- Backfill neutral status from legacy mysoft_status (kept as-is, no retro edit).
update tenants set provider_status = mysoft_status where provider_status is null;
alter table tenants alter column provider_status set default 'mock_linked';
alter table tenants alter column provider_status set not null;

-- Per-tenant provider secrets (e.g. Nilvera API keys), AES-GCM via AUTH_MASTER_KEY.
create table if not exists tenant_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check (provider in ('nilvera')),
  api_key_enc text not null,
  api_key_iv text not null,
  api_key_tag text not null,
  key_version int not null default 1,
  environment text not null default 'test' check (environment in ('test', 'prod')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

alter table tenant_provider_credentials enable row level security;
alter table tenant_provider_credentials force row level security;
revoke all on table tenant_provider_credentials from anon, authenticated;
