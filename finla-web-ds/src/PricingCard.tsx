import React from 'react';
import { colors, radius, font, shadow } from './tokens';
import { Button } from './Button';
import { Badge } from './Badge';

export interface PricingCardProps {
  /** Plan name */
  plan: string;
  /** Price string (e.g. "₺299") */
  price: string;
  /** Billing period label (e.g. "/ ay") */
  period?: string;
  /** Short description below the price */
  description?: string;
  /** List of included features */
  features?: string[];
  /** CTA button label */
  cta?: string;
  /** Visually highlight this card (recommended/popular plan) */
  highlighted?: boolean;
  /** Badge label for highlighted plans */
  badge?: string;
}

export function PricingCard({
  plan,
  price,
  period = '/ ay',
  description,
  features = [],
  cta = 'Başla',
  highlighted = false,
  badge = 'Popüler',
}: PricingCardProps) {
  const bg = highlighted ? colors.primary : colors.bg;
  const textColor = highlighted ? colors.primaryText : colors.primary;
  const subColor = highlighted ? 'rgba(255,255,255,0.6)' : colors.muted;
  const featureColor = highlighted ? 'rgba(255,255,255,0.85)' : colors.mutedDark;
  const borderColor = highlighted ? 'transparent' : colors.border;
  const boxShadow = highlighted ? shadow.xl : shadow.sm;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '28px',
        backgroundColor: bg,
        borderRadius: radius.lg,
        border: `1px solid ${borderColor}`,
        boxShadow,
        fontFamily: font.family,
        position: 'relative',
      }}
    >
      {highlighted && (
        <div style={{ position: 'absolute', top: '-1px', right: '24px' }}>
          <Badge variant="accent">{badge}</Badge>
        </div>
      )}

      {/* Plan + price */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span
          style={{
            fontSize: font.size.sm,
            fontWeight: font.weight.semibold,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: subColor,
          }}
        >
          {plan}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span
            style={{
              fontSize: font.size['4xl'],
              fontWeight: font.weight.bold,
              color: textColor,
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            {price}
          </span>
          <span style={{ fontSize: font.size.base, color: subColor }}>{period}</span>
        </div>
        {description && (
          <p style={{ margin: 0, fontSize: font.size.base, color: subColor, lineHeight: 1.5 }}>
            {description}
          </p>
        )}
      </div>

      {/* Features */}
      {features.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            flex: 1,
          }}
        >
          {features.map((f, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: font.size.base,
                color: featureColor,
                lineHeight: 1.4,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="11" fill={highlighted ? 'rgba(255,255,255,0.15)' : colors.surface} />
                <path d="M7 12l3.5 3.5L17 8" stroke={highlighted ? colors.primaryText : colors.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
      )}

      <Button
        variant={highlighted ? 'secondary' : 'primary'}
        size="md"
        fullWidth
      >
        {cta}
      </Button>
    </div>
  );
}
