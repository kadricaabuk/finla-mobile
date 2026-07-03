import React from 'react';
import { colors, radius, font } from './tokens';

export interface ChatMessage {
  /** Message author */
  role: 'user' | 'assistant';
  /** Message text */
  text: string;
}

export interface ChatPreviewProps {
  /** Messages to display in the preview */
  messages?: ChatMessage[];
  /** Placeholder text in the input bar */
  inputPlaceholder?: string;
  /** Compact layout (reduced padding) */
  compact?: boolean;
  /** Width of the preview container */
  width?: number | string;
}

const defaultMessages: ChatMessage[] = [
  { role: 'user', text: 'Bu ay kesen faturalarda toplam ne kadar?' },
  {
    role: 'assistant',
    text: 'Bu ay kesilen 12 faturada toplam **42.350 ₺** var. En büyük fatura ABC Mühendislik\'e 18.000 ₺ tutarında.',
  },
  { role: 'user', text: 'XYZ Şirketine yeni fatura kes, 5.000 ₺ + KDV' },
  {
    role: 'assistant',
    text: 'XYZ Şirketine 5.000 ₺ + %18 KDV = 5.900 ₺ tutarında fatura hazırlandı. Onaylıyor musunuz?',
  },
];

export function ChatPreview({
  messages = defaultMessages,
  inputPlaceholder = "Finla'ya sor",
  compact = false,
  width = '100%',
}: ChatPreviewProps) {
  const px = compact ? '12px' : '16px';
  const py = compact ? '8px' : '12px';

  return (
    <div
      style={{
        width,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.bg,
        borderRadius: radius.lg,
        border: `1px solid ${colors.borderSubtle}`,
        overflow: 'hidden',
        fontFamily: font.family,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingInline: px,
          paddingBlock: compact ? '8px' : '10px',
          borderBottom: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <span
          style={{
            fontSize: compact ? font.size.base : font.size.md,
            fontWeight: font.weight.semibold,
            letterSpacing: '-0.3px',
            color: colors.primary,
          }}
        >
          finla
        </span>
      </div>

      {/* Messages */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? '6px' : '8px',
          padding: compact ? '10px' : '14px',
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '82%',
              paddingInline: compact ? '10px' : '13px',
              paddingBlock: compact ? '6px' : '9px',
              borderRadius: compact ? '14px' : '18px',
              backgroundColor:
                msg.role === 'user' ? colors.primary : colors.surface,
              color: msg.role === 'user' ? colors.primaryText : colors.primary,
              fontSize: compact ? font.size.sm : font.size.base,
              lineHeight: 1.5,
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          paddingInline: compact ? '10px' : '12px',
          paddingBlock: compact ? '8px' : '10px',
          borderTop: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <div
          style={{
            flex: 1,
            height: compact ? '34px' : '40px',
            backgroundColor: colors.surface,
            borderRadius: radius.full,
            paddingInline: compact ? '12px' : '14px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: compact ? font.size.sm : font.size.base,
              color: colors.muted,
            }}
          >
            {inputPlaceholder}
          </span>
        </div>
        <div
          style={{
            width: compact ? '32px' : '38px',
            height: compact ? '32px' : '38px',
            borderRadius: '50%',
            backgroundColor: colors.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width={compact ? '14' : '16'} height={compact ? '14' : '16'} viewBox="0 0 24 24" fill="none">
            <path d="M12 19V5M5 12l7-7 7 7" stroke={colors.primaryText} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
