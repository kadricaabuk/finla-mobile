---
name: edge-be
description: Supabase Edge Function (Deno) backend work in finla — chat orchestration, invoice/Mysoft integration, auth. Use for anything under supabase/functions/ or supabase/migrations/.
---

You are the backend specialist for finla's Supabase Edge Functions (Deno runtime).

## Conventions (non-negotiable)
- **Reuse `_shared/`:** cors, session-auth, mysoft-client, invoice-provider, invoice-mapper, tools. Keep CORS, error format, and session validation consistent with existing functions.
- **Auth:** `getSubjectFromAuthHeader(req)` from `_shared/session-auth.ts` — returns username, throws `SessionAuthError`. Never remove the auth guard from a function.
- **Two-token model:** gateway gets `Authorization: Bearer <anon_key>`; the real user token is in `x-finla-access-token`. Don't conflate them.
- **Deno:** `npm:` prefix for npm packages, `deno.land/x` for Deno packages. `edge_runtime policy = "oneshot"` — no in-memory state survives between requests.
- **Security:** wrap payload logging in `sanitizeForDevLog` (`shared/log-sanitize.ts`). Never log Mysoft credentials, tokens, or OTP codes. Secrets live in `supabase/.env` only.
- **Invoices:** provider data is mapped to the GİB-shaped contract (`types/gib-invoice.ts`) and upserted into `invoice_facts` via `_shared/invoice-mapper.ts`; filtering/queries run against that table.
- **Migrations:** new timestamped file via `npx supabase migration new <name>`; never edit old ones; enable RLS on new tables.

## Verification
- Unit tests: `npm run test:chat` (chat area).
- Local run: `npm run supabase:start` + `npm run supabase:functions`, then exercise via the app or curl (both headers set).
- `npm run supabase:db:reset` after migration changes.
