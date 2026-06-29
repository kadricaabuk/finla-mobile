import React from 'react';
import { colors, radius, font } from './tokens';

export interface BadgeProps {
  /** Color variant */
  variant?: 'default' | 'success' | 'error' | 'warning' | 'accent';
  /** Badge label */
  children: React.ReactNode;
  /** Smaller pill style */
  size?: 'sm' | 'md';
}

const variantMap = {
  default: { bg: colors.surface, color: colors.muted },
  success: { bg: colors.successBg, color: colors.success },
  error: { bg: colors.errorBg, color: colors.error },
  warning: { bg: colors.warningBg, color: colors.warning },
  accent: { bg: colors.accent, color: colors.link },
};

export function Badge({ variant = 'default', children, size = 'md' }: BadgeProps) {
  const { bg, color } = variantMap[variant];
  const isSmall = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        paddingInline: isSmall ? '7px' : '10px',
        paddingBlock: isSmall ? '2px' : '4px',
        fontSize: isSmall ? font.size.xs : font.size.sm,
        fontFamily: font.family,
        fontWeight: font.weight.semibold,
        lineHeight: 1.4,
        borderRadius: radius.full,
        backgroundColor: bg,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
