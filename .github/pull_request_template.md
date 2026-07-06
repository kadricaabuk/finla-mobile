## Summary

<!-- What does this PR change and why? -->

## Checks

- [ ] `npm run lint` passes locally (also enforced in CI)
- [ ] `npm run test:chat` and `npm run test:auth-lock` pass (also enforced in CI)
- [ ] `npm run maestro:smoke` passes locally (optional; CI Maestro workflow is disabled for now)

## Maestro (local)

```bash
cp .maestro/.env.example .maestro/.env   # set TEST_PHONE / TEST_PIN for staging
# .env.local → staging EXPO_PUBLIC_* (see .env.example)
npm run ios
npm run maestro:smoke
```

Staging test user must have **tenant linked** and **`outgoingInvoices`** feature flag enabled.
