# Run Relevant Tests

Run the tests relevant to my current changes: $ARGUMENTS

1. Inspect the working tree (`git status` / `git diff --stat`) to see which areas changed.
2. Pick tests by area:
   - `supabase/functions/chat/**` or `_shared/invoice-workflow|gib-tax-codes|date ranges` → `npm run test:chat`
   - `lib/app-lock-policy.ts` / `lib/biometric-auth.ts` / `app/unlock.tsx` → `npm run test:auth-lock`
   - UI screens (chat, invoices, menu, profile, login/logout) → the matching `npm run maestro:<flow>`; broad UI changes → `npm run maestro:smoke`
   - Anything else TypeScript → at minimum `npm run lint`
3. Maestro prerequisites: app running on the simulator (`npm run ios`), test env in `.env.local`.
4. Report results plainly; if a test fails, show the failing output and stop before making further changes.
5. If docs/paths changed, also run `npm run docs:check`.
