# CLAUDE.md

Last verified: 2026-07-09 @ 544bef1 — run `npm run docs:check` after moving/deleting files; bump this line when updating this doc.

## Stack
- **Mobile:** React Native 0.81 + Expo 54 + expo-router (file-based routing)
- **Backend:** Supabase Edge Functions (Deno runtime)
- **AI:** Claude API via the `chat` Edge Function — streaming responses over NDJSON (`chat/ndjson-stream.ts`)
- **DB:** Supabase PostgreSQL (16 migrations; local dev: `npm run supabase:start`)
- **E-invoice:** Mysoft e-document API (`_shared/mysoft-client.ts`) — connects to GİB through Mysoft; the GİB-shaped data contract (`types/gib-invoice.ts`) is preserved end to end
- **Auth:** Custom JWT — phone + OTP (`_shared/otp-service.ts`, `_shared/user-service.ts`) → access/refresh tokens (expo-secure-store)
- **App lock:** Biometric/Face ID re-lock via expo-local-authentication (`lib/app-lock-policy.ts`, `contexts/app-lock-context.tsx`)
- **Native patches:** patch-package via `postinstall` (`patches/`)

## Commands
```bash
npm start                  # Expo dev server (resolves local API host first)
npm run ios                # iOS simulator
npm run ios:clean          # iOS with cleared cache
npm run android            # Android emulator
npm run lint               # ESLint

npm run supabase:bootstrap # First-time: init supabase/.env + start local stack
npm run supabase:start     # Local Supabase (validates env first)
npm run supabase:functions # Serve Edge Functions locally (with supabase/.env)
npm run supabase:db:reset  # Re-apply all migrations from scratch
npm run supabase:status:env  # Print local URLs/keys as env lines
npx supabase migration new <name>   # New migration (timestamped)
```

## Testing
```bash
npm run test:chat          # Deno unit tests: intents, date-range, invoice-workflow, chat-history, invoice-tax
npm run test:auth-lock     # Deno unit test: lib/app-lock-policy.test.ts
npm run maestro:smoke      # E2E P0 path: login → chat → menu → invoices → logout
npm run maestro:test       # All Maestro flows in .maestro/flows/
```
- Manual QA checklist lives in `QA.md` (update Pass/Fail columns as you test).
- Maestro needs the app on a simulator (`npm run ios`) and `TEST_PHONE` / `TEST_PIN` in `.maestro/.env` (copy from `.maestro/.env.example`; staging user with tenant linked and onboarding complete).
- CI E2E: `scripts/ci-maestro-ios.sh`.

## Architecture
```
finla/
├── app/
│   ├── _layout.tsx                # Root Stack: login + onboarding + unlock + (main)
│   ├── login.tsx                  # Phone + OTP login
│   ├── onboarding.tsx             # First-run onboarding (local state: lib/onboarding-local.ts)
│   ├── unlock.tsx                 # Biometric unlock screen (app lock)
│   └── (main)/
│       ├── _layout.tsx            # MainAppShellProvider + Stack; shared SideMenu
│       ├── index.tsx              # → chat-screen (/, chat)
│       ├── invoices.tsx           # → invoices-screen (/invoices)
│       ├── incoming-invoices.tsx  # Incoming (received) invoices
│       ├── outgoing-invoices.tsx  # Outgoing (issued) invoices
│       └── profile.tsx            # → profile-screen
├── contexts/
│   ├── main-app-shell-context.tsx # Session bootstrap, conversations list, side-menu binding API
│   └── app-lock-context.tsx       # App lock state (background → relock)
├── components/
│   ├── chat/                      # chat-screen, use-chat-screen, use-chat-stream-display,
│   │                              # chat-message-bubble, invoice-detail-modal, invoice-preview-modal
│   ├── invoices/                  # invoices-screen, use-invoices-screen, list/filters, inbox response modal
│   ├── profile/                   # profile-screen, use-profile-screen
│   ├── layout/                    # buttons, skeletons, face-id-lock-screen, privacy-cover, screen-states
│   ├── chat-input.tsx
│   └── side-menu.tsx
├── hooks/                         # use-finla-session, use-conversations-list, use-logout,
│                                  # use-drawer-chat-navigation, use-keyboard,
│                                  # use-scroll-to-end-on-keyboard, use-register-main-shell-side-menu
├── types/                         # chat-actions.ts, chat-stream.ts, gib-invoice.ts, incoming-invoice.ts,
│                                  # api-responses.ts, conversations.ts
├── constants/                     # chat-markdown-styles.ts
├── shared/                        # Code shared by RN AND Deno: log-sanitize.ts
├── lib/
│   ├── api.ts                     # All Edge Function calls + token refresh (single mutex)
│   ├── supabase.ts                # callApi/login/logout — re-export of @/lib/api
│   ├── session.ts                 # expo-secure-store token read/write
│   ├── app-lock-policy.ts         # When to relock (pure logic + tests); biometric-auth.ts executes
│   ├── dev-api-host.ts            # Resolves 127.0.0.1 per device (simulator/emulator/physical)
│   ├── invoices-cache.ts          # Invoice list offline/TTL cache (keyed by access token)
│   ├── chat-quick-replies.ts      # [öneriler: a | b] marker → quick-reply chips
│   ├── excel-share.ts, format-gib-invoice.ts, sort-gib-invoices.ts
│   └── invoice-date-presets.ts, pretty-invoice-status.ts, incoming-invoice-status.ts, …
├── supabase/
│   ├── functions/
│   │   ├── _shared/               # cors, crypto, session-auth, mysoft-* modules, invoice-provider,
│   │   │                          # invoice-workflow, invoice-mapper, gib-tax-codes, gib-unit-codes,
│   │   │                          # exchange-rate, otp/password/phone/user/profile-service, tools
│   │   ├── auth/                  # Phone+OTP login/register/link-tenant → custom JWT
│   │   ├── chat/                  # Claude orchestrator: agent-loop, intents, date-range,
│   │   │                          # ndjson-stream (streaming), tools/, finalize, message-store
│   │   ├── conversations/         # Conversation list + message loading
│   │   ├── invoices/              # Invoice queries + invoice_facts upsert (via Mysoft)
│   │   ├── invoice-detail/        # Single invoice detail (outgoing totals are scraped from preview HTML)
│   │   ├── invoice-html/          # Invoice HTML preview
│   │   ├── invoice-inbox-action/  # Inbox actions (accept/reject etc.)
│   │   ├── excel-export/          # Invoice list → .xlsx + Storage signed URL
│   │   ├── profile/               # User profile
│   │   ├── logout/                # Token invalidation
│   │   ├── refresh/               # Access token refresh
│   │   └── mysoft-smoke/          # Mysoft integration smoke test
│   └── migrations/                # 001_initial → 012_… then timestamped (enable_rls, …)
├── ds-bundle/ + finla-web-ds/     # Web design system (monochrome-first tokens; see ds-bundle/README.md)
├── patches/                       # patch-package diffs (expo-sharing)
├── plugins/                       # Expo config plugins (with-android-apk-name.js)
├── .maestro/                      # E2E flows + subflows
└── docs/                          # mysoft/ — Mysoft API references
```

## Critical files
| File | Purpose |
|---|---|
| `lib/api.ts` | All API calls; token refresh on 401 (single mutex prevents races) |
| `lib/supabase.ts` | UI imports `callApi` / `loginRequest` / `logoutRequest` from here (re-export) |
| `lib/session.ts` | expo-secure-store token storage |
| `lib/app-lock-policy.ts` | Pure relock decision logic (unit-tested); `lib/biometric-auth.ts` runs the prompt |
| `hooks/use-finla-session.ts` | Session label + bootstrap; redirects to login |
| `contexts/main-app-shell-context.tsx` | `(main)` layout: session + SideMenu in one place; screens bind handlers via `useRegisterMainShellSideMenu` |
| `components/chat/chat-screen.tsx` | Chat UI; business logic in `use-chat-screen.ts`, stream display in `use-chat-stream-display.ts` |
| `components/invoices/invoices-screen.tsx` | Invoice list UI; business logic in `use-invoices-screen.ts` |
| `lib/invoices-cache.ts` | Invoice list cache (keyed by access token) |
| `shared/log-sanitize.ts` | Log redaction shared by RN and Deno — see Security |
| `supabase/functions/chat/index.ts` | Chat entrypoint; orchestration in `agent-loop.ts` |
| `supabase/functions/chat/intents.ts` | Intent detection (unit-tested) |
| `supabase/functions/chat/ndjson-stream.ts` | NDJSON streaming of Claude responses to the app |
| `supabase/functions/_shared/tools.ts` | Claude tool definitions (13 tools: create_invoice, list_invoices, invoice_totals, …) |
| `supabase/functions/_shared/chat-types.ts` | Deno copy of the chat-action payload contract — edit in tandem with `types/chat-actions.ts` |
| `supabase/functions/_shared/invoice-workflow.ts` | Invoice creation workflow state (unit-tested) |
| `supabase/functions/_shared/session-auth.ts` | Edge Function JWT middleware — `getSubjectFromAuthHeader(req)` |
| `supabase/functions/_shared/mysoft-client.ts` | Mysoft e-document API client |
| `supabase/functions/_shared/invoice-provider/mysoft-provider.ts` | Mysoft implementation of the invoice-provider interface |
| `supabase/functions/_shared/invoice-mapper.ts` | `mapInvoicesToFacts` — provider-agnostic invoice → `invoice_facts` |
| `supabase/functions/_shared/gib-tax-codes.ts` | Tevkifat/istisna (withholding/exemption) tax codes |
| `supabase/functions/auth/index.ts` | Phone+OTP login/register/link-tenant flow |

## Security
This is a fintech app. Treat everything below as hard rules.
- **Secrets in `supabase/.env`** (never committed; template: `supabase/.env.example`):
  - `AUTH_MASTER_KEY` — encrypts credentials at rest (credentials vault)
  - `AUTH_JWT_SECRET` — signs custom access tokens
  - `AUTH_REFRESH_PEPPER` — peppers refresh-token hashes
  - `MYSOFT_USERNAME` / `MYSOFT_PASSWORD` / `MYSOFT_API_URL`, `ANTHROPIC_API_KEY`
  - `AUTH_OTP_DEBUG`, `MYSOFT_MOCK` — local development only
- **Never log secrets:** any log of request/response payloads MUST go through `sanitizeForDevLog` from `shared/log-sanitize.ts`. It redacts keys matching `/password|sms_code|token|cred|secret|refresh/i`, plus `code`, and truncates `html`/`preview_html`. Never `console.log` Mysoft credentials/tokens or include them in error messages.
- **"Mysoft" is never shown in the UI.** User-facing copy refers to the e-invoice provider generically.
- **Never commit `.env*` files** (`.env.local`, `supabase/.env` hold real keys).
- Two-token model (see Gotchas): the anon key is public, but the `x-finla-access-token` value is a real credential — same logging rules apply.

## Native / Release
- **patch-package:** `patches/expo-sharing+55.0.18.patch` is applied on `npm install` (postinstall). To change a patch: edit the package in `node_modules`, then `npx patch-package <package-name>`.
- **Config plugin:** `plugins/with-android-apk-name.js` sets the Android APK output name (wired in `app.json`).
- **EAS builds:** `eas.json` profiles — `development` (dev client, internal), `preview` (internal), `production` (auto-increment, remote app version source).
- `ios/` and `android/` are prebuilt and checked in — prefer Expo config/plugins for native changes.

## Gotchas
- **Two separate tokens:** the Supabase gateway expects `Authorization: Bearer <anon_key>`; the real user token travels in the `x-finla-access-token` header. Don't mix them up.
- **invoice_facts upsert:** raw Mysoft invoice data is mapped to the GİB-shaped form and written to `invoice_facts`; filtering happens there.
- **API imports:** UI gets `callApi` via `@/lib/supabase` (re-export of `lib/api.ts`). `callEdgeFunction` is deprecated — use `callApi` directly.
- **Local Supabase:** Edge Functions can't be tested without `npm run supabase:start`. `edge_runtime policy = "oneshot"` — every request boots a fresh worker.
- **Dev API host:** `.env.local` uses `127.0.0.1`; `lib/dev-api-host.ts` rewrites it per device (iOS sim → 127.0.0.1, Android emu → 10.0.2.2, physical device → `EXPO_PUBLIC_DEV_API_HOST` set by `scripts/resolve-local-expo-env.sh`).
- **enable_signup = false:** Supabase auth is disabled; auth is fully custom phone+OTP.
- **Language convention:** all code comments/JSDoc/docs in English; UI strings stay Turkish.
- **Duplicated action contract:** the chat-action payload types exist twice — `types/chat-actions.ts` (RN) and `supabase/functions/_shared/chat-types.ts` (Deno). Any payload change must update both.
- **feature_flags table:** exists in DB (migration 010) but is currently unused by any code — don't build on it without checking first.

## Forbidden / risky
- Editing files in `supabase/migrations/` retroactively — always add a new migration
- Deploying to production (`supabase functions deploy`) without local testing
- Removing the session-auth guard from any Edge Function

## Claude setup
- **MCP:** Supabase HTTP MCP (`.claude/settings.json`)
- **Skill:** `frontend-design` (`.claude/skills/`) — visual/aesthetic direction for new UI
- **Commands:** `/chat-action`, `/edge-fn`, `/migration`, `/test` (`.claude/commands/`)
- **Agents:** `mobile-fe`, `edge-be`, `qa` (`.claude/agents/`)
