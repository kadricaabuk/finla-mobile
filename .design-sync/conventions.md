# Finla Design System — Conventions

## Wrapping and setup

No provider is required. All components are self-contained with inline styles and work standalone. Import directly from `finla-web-ds`:

```jsx
import { Button, Hero, PricingCard } from 'finla-web-ds';
```

## Design language

Finla is **monochrome-first**: the primary action color is `#000000` (black), backgrounds are `#ffffff`. Accent blues (`#0066CC`) are for links only. Status colors — green `#22C55E`, red `#EF4444`, amber `#F59E0B` — appear only in badges and status indicators.

**Core tokens (as inline style values):**

| Purpose | Value |
|---|---|
| Primary / CTA | `#000000` |
| Primary text | `#ffffff` |
| Background | `#ffffff` |
| Surface (cards, bubbles) | `#F2F2F2` / `#FAFAFA` |
| Border | `#E0E0E0` / `#F0F0F0` |
| Muted text | `#ABABAB` / `#666666` |
| Link / accent | `#0066CC` |
| Success | `#22C55E` |
| Error | `#EF4444` |

**Border radius:**

| Role | Value |
|---|---|
| Small elements (badges) | `6–8px` |
| Inputs, buttons | `12px` |
| Cards | `14px` |
| Bubbles | `20px` |
| Pills / fully round | `9999px` |

**Typography:** System font stack (`-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Helvetica, sans-serif`). Letter-spacing is tight: headlines at `-0.02em` to `-0.03em`, logo at `-1px`. Weights: 400 (body), 500 (labels), 600 (UI / semi-emphasis), 700 (headlines).

## Styling idiom

All components style via **inline style objects** — there are no CSS classes to apply. The `colors`, `radius`, `font`, `shadow`, and `spacing` token objects are exported for building custom glue code:

```jsx
import { colors, font, radius } from 'finla-web-ds';

<div style={{ backgroundColor: colors.surface, borderRadius: radius.md, fontFamily: font.family }}>
  content
</div>
```

Do not reference CSS variables (`var(--finla-*)`) in components — the token exports are the canonical API.

## Where the truth lives

- Per-component API: `components/<group>/<Name>/<Name>.d.ts` (`<Name>Props` interface)
- Per-component usage guide: `components/<group>/<Name>/<Name>.prompt.md`
- Token reference: `tokens/` directory and the `colors`/`font`/`radius`/`shadow`/`spacing` exports

## Idiomatic composition

A typical landing page section using Finla components:

```jsx
import { SectionHeading, FeatureCard, Button } from 'finla-web-ds';

<section style={{ padding: '80px 28px', background: '#fff' }}>
  <SectionHeading
    eyebrow="Neden Finla?"
    title="Fatura yönetimi bu kadar zor olmak zorunda değil"
    subtitle="GİB sistemine doğrudan bağlanın ve yapay zeka ile yönetin."
    align="center"
  />
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '48px' }}>
    <FeatureCard icon="🤖" title="Yapay Zeka" description="Doğal dil ile sorgulayın." />
    <FeatureCard icon="⚡" title="Hızlı Fatura" description="Tek sohbetle fatura kesin." />
    <FeatureCard icon="🔒" title="Güvenli" description="GİB şifreleriniz şifreli vault'ta." />
  </div>
  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px' }}>
    <Button variant="primary" size="lg">Ücretsiz Başla</Button>
  </div>
</section>
```

**Layout note:** Finla uses `paddingInline: '28px'` and `maxWidth: '1100px'` for page-level containers. Section padding is typically `paddingBlock: '80px'`.
