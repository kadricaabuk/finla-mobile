-- Edge functions use the service-role client for all DB access. On hosted
-- Supabase these grants exist out of the box, but the local stack (CLI-bundled
-- Postgres) has shipped without them, so every table returned 42501
-- "permission denied" after a `db reset`. Granting explicitly makes local
-- resets self-contained; on hosted projects this is a no-op.
-- service_role has BYPASSRLS, so RLS policies are unaffected by this.
grant usage on schema public to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

-- Cover tables created by future migrations regardless of which admin role
-- runs them (local applies migrations as postgres, hosted as supabase_admin).
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;
