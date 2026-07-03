export const colors = {
  primary: '#000000',
  primaryText: '#ffffff',
  bg: '#ffffff',
  surface: '#F2F2F2',
  surfaceAlt: '#FAFAFA',
  border: '#E0E0E0',
  borderSubtle: '#F0F0F0',
  muted: '#ABABAB',
  mutedDark: '#666666',
  mutedLight: '#888888',
  link: '#0066CC',
  success: '#22C55E',
  successBg: 'rgba(34,197,94,0.12)',
  error: '#EF4444',
  errorBg: 'rgba(239,68,68,0.12)',
  warning: '#F59E0B',
  warningBg: 'rgba(245,158,11,0.12)',
  accent: '#E6F4FE',
} as const;

export const radius = {
  xs: '6px',
  sm: '8px',
  md: '12px',
  lg: '14px',
  xl: '20px',
  full: '9999px',
} as const;

export const font = {
  family: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Helvetica, sans-serif",
  size: {
    xs: '11px',
    sm: '12px',
    base: '14px',
    md: '15px',
    lg: '16px',
    xl: '18px',
    '2xl': '22px',
    '3xl': '28px',
    '4xl': '36px',
    '5xl': '48px',
    '6xl': '60px',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
  },
} as const;

export const shadow = {
  sm: '0 1px 3px rgba(0,0,0,0.08)',
  md: '0 4px 16px rgba(0,0,0,0.08)',
  lg: '0 8px 32px rgba(0,0,0,0.12)',
  xl: '0 16px 48px rgba(0,0,0,0.16)',
} as const;

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
} as const;
