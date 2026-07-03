import React from 'react';
import { colors, font } from './tokens';

export interface SectionHeadingProps {
  /** Small uppercase label above the title */
  eyebrow?: string;
  /** Main section title */
  title: string;
  /** Supporting text below the title */
  subtitle?: string;
  /** Text alignment */
  align?: 'left' | 'center';
  /** Title size variant */
  size?: 'md' | 'lg' | 'xl';
}

const sizeMap = {
  md: font.size['2xl'],
  lg: font.size['3xl'],
  xl: font.size['4xl'],
};

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  size = 'lg',
}: SectionHeadingProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        textAlign: align,
        fontFamily: font.family,
      }}
    >
      {eyebrow && (
        <span
          style={{
            fontSize: font.size.sm,
            fontWeight: font.weight.semibold,
            color: colors.muted,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          {eyebrow}
        </span>
      )}
      <h2
        style={{
          margin: 0,
          fontSize: sizeMap[size],
          fontWeight: font.weight.bold,
          color: colors.primary,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            margin: 0,
            fontSize: font.size.xl,
            fontWeight: font.weight.regular,
            color: colors.mutedDark,
            lineHeight: 1.55,
            maxWidth: '560px',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
