-- Lock down public tables: Edge Functions use service_role (bypasses RLS).
-- anon/authenticated get no policies → PostgREST direct access is denied.

alter table public.conversations enable row level security;
alter table public.conversations force row level security;

alter table public.messages enable row level security;
alter table public.messages force row level security;

alter table public.gib_sessions enable row level security;
alter table public.gib_sessions force row level security;

alter table public.auth_sessions enable row level security;
alter table public.auth_sessions force row level security;

alter table public.invoice_facts enable row level security;
alter table public.invoice_facts force row level security;

alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;

alter table public.users enable row level security;
alter table public.users force row level security;

alter table public.tenants enable row level security;
alter table public.tenants force row level security;

alter table public.user_tenants enable row level security;
alter table public.user_tenants force row level security;

alter table public.otp_challenges enable row level security;
alter table public.otp_challenges force row level security;

revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.gib_sessions from anon, authenticated;
revoke all on table public.auth_sessions from anon, authenticated;
revoke all on table public.invoice_facts from anon, authenticated;
revoke all on table public.feature_flags from anon, authenticated;
revoke all on table public.users from anon, authenticated;
revoke all on table public.tenants from anon, authenticated;
revoke all on table public.user_tenants from anon, authenticated;
revoke all on table public.otp_challenges from anon, authenticated;

revoke all on function public.get_invoice_totals(text, date, date) from public, anon, authenticated;
revoke all on function public.get_latest_invoice(text, date, date) from public, anon, authenticated;
revoke all on function public.touch_invoice_facts_updated_at() from public, anon, authenticated;
