import React from 'react';
import { colors, font } from './tokens';

export interface AvatarProps {
  /** The character(s) shown inside the avatar */
  initial: string;
  /** Avatar size */
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
  sm: { dim: '28px', fontSize: font.size.sm, borderRadius: '14px' },
  md: { dim: '36px', fontSize: font.size.base, borderRadius: '18px' },
  lg: { dim: '44px', fontSize: font.size.lg, borderRadius: '22px' },
  xl: { dim: '56px', fontSize: font.size['2xl'], borderRadius: '28px' },
};

export function Avatar({ initial, size = 'md' }: AvatarProps) {
  const { dim, fontSize, borderRadius } = sizeMap[size];
  return (
    <div
      style={{
        width: dim,
        height: dim,
        borderRadius,
        backgroundColor: colors.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: colors.primaryText,
          fontSize,
          fontFamily: font.family,
          fontWeight: font.weight.semibold,
          lineHeight: 1,
          textTransform: 'uppercase',
        }}
      >
        {initial.charAt(0)}
      </span>
    </div>
  );
}
