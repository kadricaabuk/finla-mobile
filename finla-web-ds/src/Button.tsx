import React from 'react';
import { colors, radius, font } from './tokens';

export interface ButtonProps {
  /** Visual style of the button */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Size of the button */
  size?: 'sm' | 'md' | 'lg';
  /** Button label */
  children: React.ReactNode;
  /** Disabled state */
  disabled?: boolean;
  /** Stretch to full container width */
  fullWidth?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** HTML button type */
  type?: 'button' | 'submit' | 'reset';
}

const sizeStyles = {
  sm: { height: '36px', paddingInline: '14px', fontSize: font.size.base, borderRadius: radius.md },
  md: { height: '44px', paddingInline: '20px', fontSize: font.size.lg, borderRadius: radius.md },
  lg: { height: '52px', paddingInline: '28px', fontSize: font.size.lg, borderRadius: radius.md },
};

const variantStyles = {
  primary: {
    backgroundColor: colors.primary,
    color: colors.primaryText,
    border: `1.5px solid ${colors.primary}`,
  },
  secondary: {
    backgroundColor: colors.bg,
    color: colors.primary,
    border: `1.5px solid ${colors.primary}`,
  },
  ghost: {
    backgroundColor: 'transparent',
    color: colors.primary,
    border: '1.5px solid transparent',
  },
};

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  disabled = false,
  fullWidth = false,
  onClick,
  type = 'button',
}: ButtonProps) {
  const sz = sizeStyles[size];
  const vr = variantStyles[variant];

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        width: fullWidth ? '100%' : 'auto',
        height: sz.height,
        paddingInline: sz.paddingInline,
        fontSize: sz.fontSize,
        fontFamily: font.family,
        fontWeight: font.weight.semibold,
        lineHeight: 1,
        letterSpacing: '-0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        borderRadius: sz.borderRadius,
        transition: 'opacity 120ms, background-color 120ms',
        whiteSpace: 'nowrap',
        textDecoration: 'none',
        ...vr,
      }}
    >
      {children}
    </button>
  );
}
