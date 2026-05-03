create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.feature_flags enable row level security;

insert into public.feature_flags (key, enabled)
values
  ('outgoing_invoices', true),
  ('incoming_invoices', false),
  ('profile', true)
on conflict (key) do nothing;
