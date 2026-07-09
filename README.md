# Finla

AI-assisted e-invoicing app for Turkish freelancers and small businesses. Users chat with an assistant (Claude) to issue, query, and manage GİB e-invoices — the backend talks to GİB through the Mysoft e-document API. Mobile app built with React Native + Expo; backend runs on Supabase Edge Functions (Deno).

## Prerequisites

- Node.js 20+, npm
- Xcode (iOS) / Android Studio (Android)
- [Supabase CLI](https://supabase.com/docs/guides/local-development) (installed as a dev dependency; `npx supabase` works)
- Docker (for the local Supabase stack)
- [Maestro](https://maestro.mobile.dev) (optional, for E2E tests)

## Setup

```bash
npm install                      # also applies patches/ via patch-package

cp .env.example .env.local       # Expo env (see comments in the file)
npm run supabase:bootstrap       # init supabase/.env + start local Supabase
npm run supabase:status:env      # copy local anon key/url into .env.local

npm run supabase:functions       # serve Edge Functions (separate terminal)
npm run ios                      # build & run on iOS simulator
```

Backend secrets live in `supabase/.env` (template: `supabase/.env.example`). Never commit any `.env*` file.

## Testing

```bash
npm run lint             # ESLint
npm run test:chat        # Deno unit tests for the chat function
npm run test:auth-lock   # Deno unit tests for app-lock policy
npm run maestro:smoke    # E2E smoke: login → chat → menu → invoices → logout
npm run maestro:test     # all E2E flows
```

Manual QA checklist: [QA.md](QA.md).

## Project layout

Architecture, critical files, conventions, and security rules are documented in [CLAUDE.md](CLAUDE.md) — it is the single source of truth for how this repo is organized. Run `npm run docs:check` to verify docs still match the codebase.
