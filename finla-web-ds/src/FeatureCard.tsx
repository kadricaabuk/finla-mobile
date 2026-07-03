import React from 'react';
import { colors, radius, font, shadow } from './tokens';

export interface FeatureCardProps {
  /** Icon element (e.g. an SVG or emoji) */
  icon?: React.ReactNode;
  /** Feature title */
  title: string;
  /** Feature description */
  description: string;
  /** Background color of the icon container */
  iconBg?: string;
  /** Card visual style */
  variant?: 'default' | 'outline' | 'filled';
}

export function FeatureCard({
  icon,
  title,
  description,
  iconBg = colors.surface,
  variant = 'default',
}: FeatureCardProps) {
  const bg =
    variant === 'filled'
      ? colors.primary
      : variant === 'outline'
        ? colors.bg
        : colors.bg;

  const textColor = variant === 'filled' ? colors.primaryText : colors.primary;
  const descColor = variant === 'filled' ? 'rgba(255,255,255,0.65)' : colors.mutedDark;
  const borderColor = variant === 'outline' ? colors.border : 'transparent';
  const boxShadow = variant === 'default' ? shadow.sm : 'none';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '24px',
        backgroundColor: bg,
        borderRadius: radius.lg,
        border: `1px solid ${borderColor}`,
        boxShadow,
        fontFamily: font.family,
      }}
    >
      {icon && (
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: radius.md,
            backgroundColor: variant === 'filled' ? 'rgba(255,255,255,0.12)' : iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3
          style={{
            margin: 0,
            fontSize: font.size.md,
            fontWeight: font.weight.semibold,
            color: textColor,
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: font.size.base,
            fontWeight: font.weight.regular,
            color: descColor,
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
