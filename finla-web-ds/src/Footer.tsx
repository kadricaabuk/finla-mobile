import React from 'react';
import { colors, font } from './tokens';
import { Logo } from './Logo';

export interface FooterLink {
  label: string;
  href?: string;
}

export interface FooterLinkGroup {
  heading: string;
  links: FooterLink[];
}

export interface FooterProps {
  /** Tagline / description under the logo */
  description?: string;
  /** Link groups for the footer columns */
  linkGroups?: FooterLinkGroup[];
  /** Copyright line */
  copyright?: string;
}

const defaultGroups: FooterLinkGroup[] = [
  {
    heading: 'Ürün',
    links: [
      { label: 'Özellikler' },
      { label: 'Fiyatlar' },
      { label: 'Güvenlik' },
      { label: 'Değişim Günlüğü' },
    ],
  },
  {
    heading: 'Şirket',
    links: [
      { label: 'Hakkımızda' },
      { label: 'Blog' },
      { label: 'Kariyer' },
      { label: 'İletişim' },
    ],
  },
  {
    heading: 'Yasal',
    links: [
      { label: 'Gizlilik Politikası' },
      { label: 'Kullanım Şartları' },
      { label: 'KVKK' },
    ],
  },
];

export function Footer({
  description = 'GİB e-fatura sisteminizi yapay zeka ile yönetin. Finla, Türk işletmeleri için üretildi.',
  linkGroups = defaultGroups,
  copyright = `© ${new Date().getFullYear()} Finla. Tüm hakları saklıdır.`,
}: FooterProps) {
  return (
    <footer
      style={{
        width: '100%',
        backgroundColor: colors.bg,
        borderTop: `1px solid ${colors.borderSubtle}`,
        fontFamily: font.family,
      }}
    >
      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          paddingInline: '28px',
          paddingTop: '64px',
          paddingBottom: '40px',
          display: 'flex',
          flexDirection: 'column',
          gap: '48px',
        }}
      >
        {/* Top section */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '48px',
            flexWrap: 'wrap',
          }}
        >
          {/* Brand */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '280px' }}>
            <Logo size="md" variant="dark" />
            <p
              style={{
                margin: 0,
                fontSize: font.size.base,
                color: colors.muted,
                lineHeight: 1.6,
              }}
            >
              {description}
            </p>
          </div>

          {/* Link groups */}
          <div
            style={{
              display: 'flex',
              gap: '48px',
              flexWrap: 'wrap',
            }}
          >
            {linkGroups.map((group, gi) => (
              <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <span
                  style={{
                    fontSize: font.size.sm,
                    fontWeight: font.weight.semibold,
                    color: colors.primary,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {group.heading}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {group.links.map((link, li) => (
                    <a
                      key={li}
                      href={link.href ?? '#'}
                      style={{
                        fontSize: font.size.base,
                        color: colors.mutedDark,
                        textDecoration: 'none',
                        lineHeight: 1.3,
                      }}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom / copyright */}
        <div
          style={{
            borderTop: `1px solid ${colors.borderSubtle}`,
            paddingTop: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: font.size.sm, color: colors.muted }}>{copyright}</span>
          <span style={{ fontSize: font.size.sm, color: colors.muted }}>
            Türkiye'de üretildi 🇹🇷
          </span>
        </div>
      </div>
    </footer>
  );
}
