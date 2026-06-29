import React from 'react';
import { colors, font } from './tokens';
import { Logo } from './Logo';
import { Button } from './Button';

export interface NavLink {
  label: string;
  href?: string;
  active?: boolean;
}

export interface NavBarProps {
  /** Navigation links to display in center */
  links?: NavLink[];
  /** Call-to-action shown on the right */
  cta?: string;
  /** Make background transparent (for hero overlay) */
  transparent?: boolean;
  /** Logo variant */
  logoVariant?: 'dark' | 'light';
}

export function NavBar({
  links = [
    { label: 'Özellikler' },
    { label: 'Fiyatlar' },
    { label: 'Hakkımızda' },
  ],
  cta = 'Ücretsiz Dene',
  transparent = false,
  logoVariant = 'dark',
}: NavBarProps) {
  return (
    <nav
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingInline: '28px',
        paddingBlock: '14px',
        backgroundColor: transparent ? 'transparent' : colors.bg,
        borderBottom: transparent ? 'none' : `1px solid ${colors.borderSubtle}`,
        fontFamily: font.family,
        gap: '16px',
      }}
    >
      <Logo size="md" variant={logoVariant} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flex: 1,
          justifyContent: 'center',
        }}
      >
        {links.map((link, i) => (
          <a
            key={i}
            href={link.href ?? '#'}
            style={{
              padding: '8px 14px',
              fontSize: font.size.base,
              fontWeight: link.active ? font.weight.semibold : font.weight.medium,
              color: link.active ? colors.primary : colors.mutedDark,
              textDecoration: 'none',
              borderRadius: '8px',
              lineHeight: 1,
            }}
          >
            {link.label}
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Button variant="secondary" size="sm">Giriş Yap</Button>
        <Button variant="primary" size="sm">{cta}</Button>
      </div>
    </nav>
  );
}
