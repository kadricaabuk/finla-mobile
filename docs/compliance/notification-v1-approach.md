# FIN-63 V1 — Compliance notifications (technical approach)

**Status:** approach + templates landed in code (`_shared/compliance-notifications.ts`).  
**Out of scope for V1:** push OS notifications, sector news, per-customer payment reminders.

## Goal

Surface **mevzuat / uyumluluk** warnings inside chat, with 1–2 fixed Turkish templates, driven by findings the Muhasebeci agent (or a deterministic YTD rollup) already produces.

## Templates

| Id | Severity | When |
|----|----------|------|
| `efatura_threshold_approach` | warning | YTD brüt hasılat ≥ 80% of the year’s e-Fatura mükellefiyeti haddi |
| `mevzuat_update` | info | Muhasebeci confirms a UBL-TR / e-Fatura / VUK change users should know |

Threshold TRY amounts are **inputs**, not constants — GİB figures change; Muhasebeci owns the number.

## Pipeline (proposed)

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ Producer            │     │ Store (follow-up)    │     │ Delivery (V1)   │
│ • YTD invoice_facts │────▶│ compliance_alerts    │────▶│ Chat assistant  │
│ • Muhasebeci finding│     │ (tenant, template,   │     │ bubble on open  │
└─────────────────────┘     │  dedupe_key, body)   │     │ / session start │
                            └──────────────────────┘     └─────────────────┘
```

1. **Produce**
   - *Threshold:* Edge job or chat `invoice_totals` path sums YTD gross from `invoice_facts`, calls `evaluateEFaturaThresholdApproach({ year, ytdGrossTry, thresholdTry })`.
   - *Mevzuat:* Muhasebeci weekly scan posts a structured finding → `buildMevzuatUpdateNotification({ summary, sourceUrl, effectiveDate, findingKey })`.
2. **Store (next PR / migration)** — table sketch:
   - `tenant_id`, `template_id`, `dedupe_key` (unique per tenant), `severity`, `title`, `body`, `created_at`, `delivered_at`, `dismissed_at`.
   - Unique `(tenant_id, dedupe_key)` prevents re-spamming the same year/finding.
3. **Deliver (V1 = in-chat only)**
   - On chat session open (or first message of the day), undelivered rows become one assistant markdown bubble via `formatComplianceNotificationForChat`.
   - Mark `delivered_at`. No OS push yet.
4. **Explicitly not in this issue**
   - Situational CRM alerts, marketing news, Zapier/Telegram fan-out to end users.

## Why not wire delivery in this PR

Kadri’s brief asked for templates + a technical approach first. Delivery needs a migration + session-bootstrap hook; that should be a dedicated follow-up once threshold figures and Muhasebeci’s finding schema are confirmed.

## Test coverage

`supabase/functions/chat/compliance-notifications.test.ts` — pure unit tests for both builders and chat formatting.
