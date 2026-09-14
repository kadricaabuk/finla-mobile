## Summary

<!-- What does this PR change and why? -->

## Checks

- [ ] `npm run lint` passes locally (also enforced in CI)
- [ ] `npm run test:chat` and `npm run test:auth-lock` pass (also enforced in CI)
- [ ] `npm run maestro:smoke` passes locally (optional; CI Maestro workflow is disabled for now)

## Maestro (local)

```bash
cp .env.example .env   # staging EXPO_PUBLIC_* + MAESTRO_TEST_PHONE / MAESTRO_TEST_PIN
npm run ios
npm run maestro:smoke
```

Staging test user must have **tenant linked** and **`outgoingInvoices`** feature flag enabled.
