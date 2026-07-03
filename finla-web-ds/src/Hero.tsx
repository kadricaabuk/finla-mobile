import React from 'react';
import { colors, font, radius } from './tokens';
import { Button } from './Button';
import { Badge } from './Badge';

export interface HeroProps {
  /** Small badge/label above the headline */
  badge?: string;
  /** Main headline text */
  headline: string;
  /** Supporting subheadline */
  subheadline?: string;
  /** Primary CTA button label */
  primaryCta?: string;
  /** Secondary CTA button label */
  secondaryCta?: string;
  /** Right-side visual slot (e.g. PhoneMockup) */
  visual?: React.ReactNode;
  /** Layout: centered (no visual) or split (with visual) */
  layout?: 'centered' | 'split';
}

export function Hero({
  badge = 'Türk e-fatura için yapıldı',
  headline = 'Faturalarınızı yapay zeka ile yönetin',
  subheadline = 'Finla, GİB e-fatura sisteminizi doğal dil ile kullanmanızı sağlar. Fatura kesin, sorgulayın ve analiz edin — bir sohbet kadar kolay.',
  primaryCta = 'Ücretsiz Başla',
  secondaryCta = 'Demo İzle',
  visual,
  layout = 'split',
}: HeroProps) {
  const isCentered = layout === 'centered' || !visual;

  return (
    <section
      style={{
        width: '100%',
        paddingInline: '28px',
        paddingTop: '80px',
        paddingBottom: '80px',
        backgroundColor: colors.bg,
        fontFamily: font.family,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1100px',
          display: 'flex',
          flexDirection: isCentered ? 'column' : 'row',
          alignItems: 'center',
          gap: '56px',
          justifyContent: isCentered ? 'center' : 'space-between',
        }}
      >
        {/* Text content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            maxWidth: isCentered ? '680px' : '520px',
            alignItems: isCentered ? 'center' : 'flex-start',
            textAlign: isCentered ? 'center' : 'left',
          }}
        >
          {badge && <Badge variant="accent">{badge}</Badge>}

          <h1
            style={{
              margin: 0,
              fontSize: isCentered ? font.size['6xl'] : font.size['5xl'],
              fontWeight: font.weight.bold,
              color: colors.primary,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            {headline}
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: font.size.xl,
              fontWeight: font.weight.regular,
              color: colors.mutedDark,
              lineHeight: 1.6,
            }}
          >
            {subheadline}
          </p>

          <div
            style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              justifyContent: isCentered ? 'center' : 'flex-start',
            }}
          >
            <Button variant="primary" size="lg">{primaryCta}</Button>
            {secondaryCta && (
              <Button variant="secondary" size="lg">{secondaryCta}</Button>
            )}
          </div>

          <p
            style={{
              margin: 0,
              fontSize: font.size.sm,
              color: colors.muted,
              lineHeight: 1.4,
            }}
          >
            Kredi kartı gerekmez · GİB entegrasyonu hazır
          </p>
        </div>

        {/* Visual slot */}
        {visual && !isCentered && (
          <div style={{ flexShrink: 0 }}>{visual}</div>
        )}

        {/* Placeholder visual if no visual prop */}
        {!visual && !isCentered && (
          <div
            style={{
              width: '280px',
              height: '540px',
              backgroundColor: colors.surface,
              borderRadius: radius.xl,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: colors.muted, fontSize: font.size.sm }}>App Preview</span>
          </div>
        )}
      </div>
    </section>
  );
}
