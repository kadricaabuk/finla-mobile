# Edge Function Development

I'm working on a Supabase Edge Function: $ARGUMENTS

- Reuse helpers from `supabase/functions/_shared/` (cors, session-auth, mysoft-client, invoice-provider, tools)
- Keep CORS, error format, and session validation consistent with existing functions
- Deno runtime: `npm:` prefix for npm packages, `deno.land/x` for Deno packages
- Auth: `getSubjectFromAuthHeader(req)` — returns the username, throws `SessionAuthError`
- Logging: wrap any payload logging in `sanitizeForDevLog` (`shared/log-sanitize.ts`); never log Mysoft credentials or tokens
- Test locally with `npm run supabase:functions` (serves with `supabase/.env`)
