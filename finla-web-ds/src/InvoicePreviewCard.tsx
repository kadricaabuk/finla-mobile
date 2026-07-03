import React from 'react';
import { colors, radius, font } from './tokens';

export type InvoiceStatus = 'approved' | 'pending' | 'rejected' | 'cancelled';

export interface InvoicePreviewCardProps {
  /** Customer or vendor name */
  customerName: string;
  /** Invoice total amount string (e.g. "12.500,00 ₺") */
  amount: string;
  /** Invoice date string (e.g. "15 Haz 2025") */
  date: string;
  /** Invoice document number */
  invoiceNumber?: string;
  /** Approval status */
  status?: InvoiceStatus;
  /** Direction of the invoice */
  direction?: 'outgoing' | 'incoming';
}

const statusConfig: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  approved: { label: 'Onaylandı', color: colors.success, bg: colors.successBg },
  pending: { label: 'Beklemede', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  rejected: { label: 'Reddedildi', color: colors.error, bg: colors.errorBg },
  cancelled: { label: 'İptal', color: colors.muted, bg: colors.surface },
};

export function InvoicePreviewCard({
  customerName,
  amount,
  date,
  invoiceNumber,
  status = 'approved',
  direction = 'outgoing',
}: InvoicePreviewCardProps) {
  const { label, color, bg } = statusConfig[status];

  return (
    <div
      style={{
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.lg,
        border: `1px solid ${colors.borderSubtle}`,
        overflow: 'hidden',
        fontFamily: font.family,
      }}
    >
      <div
        style={{
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* Top row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontSize: font.size.md,
              fontWeight: font.weight.semibold,
              color: colors.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {customerName}
          </span>
          <span
            style={{
              fontSize: font.size.md,
              fontWeight: font.weight.bold,
              color: colors.primary,
              whiteSpace: 'nowrap',
            }}
          >
            {amount}
          </span>
        </div>

        {/* Bottom row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontSize: font.size.sm,
              color: colors.muted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {date}
            {invoiceNumber ? `  ·  ${invoiceNumber}` : ''}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                paddingInline: '8px',
                paddingBlock: '3px',
                borderRadius: '6px',
                backgroundColor: bg,
                color,
                fontSize: font.size.xs,
                fontWeight: font.weight.semibold,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke={colors.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
