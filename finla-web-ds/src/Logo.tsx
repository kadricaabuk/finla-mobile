import React from 'react';
import { colors, font } from './tokens';

export interface LogoProps {
  /** Text size of the wordmark */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Color scheme */
  variant?: 'dark' | 'light';
}

const sizeMap = {
  sm: { fontSize: '18px', letterSpacing: '-0.5px' },
  md: { fontSize: '24px', letterSpacing: '-0.8px' },
  lg: { fontSize: '32px', letterSpacing: '-1px' },
  xl: { fontSize: '48px', letterSpacing: '-1.5px' },
};

export function Logo({ size = 'md', variant = 'dark' }: LogoProps) {
  const { fontSize, letterSpacing } = sizeMap[size];
  return (
    <span
      style={{
        fontFamily: font.family,
        fontSize,
        fontWeight: font.weight.bold,
        letterSpacing,
        color: variant === 'dark' ? colors.primary : colors.bg,
        lineHeight: 1,
        userSelect: 'none',
        display: 'inline-block',
      }}
    >
      finla
    </span>
  );
}
