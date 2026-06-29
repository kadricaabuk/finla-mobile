import React from 'react';
import { colors, radius, font } from './tokens';

export interface InputProps {
  /** Field label shown above the input */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Current value */
  value?: string;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Input type */
  type?: 'text' | 'email' | 'password' | 'tel' | 'number';
  /** Disabled state */
  disabled?: boolean;
  /** Validation error message shown below the input */
  error?: string;
  /** Helper hint shown below the input */
  hint?: string;
  /** Make input fill its container */
  fullWidth?: boolean;
}

export function Input({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  disabled = false,
  error,
  hint,
  fullWidth = true,
}: InputProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        width: fullWidth ? '100%' : 'auto',
        fontFamily: font.family,
      }}
    >
      {label && (
        <label
          style={{
            fontSize: font.size.base,
            fontWeight: font.weight.medium,
            color: '#444',
            lineHeight: 1.4,
          }}
        >
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          height: '50px',
          width: '100%',
          paddingInline: '16px',
          fontSize: font.size.lg,
          fontFamily: font.family,
          fontWeight: font.weight.regular,
          color: colors.primary,
          backgroundColor: disabled ? colors.surface : colors.surfaceAlt,
          border: `1.5px solid ${error ? colors.error : colors.border}`,
          borderRadius: radius.md,
          outline: 'none',
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
          transition: 'border-color 150ms',
        }}
      />
      {error && (
        <span
          style={{
            fontSize: font.size.sm,
            color: colors.error,
            lineHeight: 1.4,
          }}
        >
          {error}
        </span>
      )}
      {hint && !error && (
        <span
          style={{
            fontSize: font.size.sm,
            color: colors.muted,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
