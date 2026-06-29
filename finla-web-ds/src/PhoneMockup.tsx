import React from 'react';
import { colors, font } from './tokens';

export interface PhoneMockupProps {
  /** Content rendered inside the phone screen */
  children?: React.ReactNode;
  /** Phone frame width in pixels */
  width?: number;
  /** Frame color */
  frameColor?: 'dark' | 'light' | 'silver';
  /** Screen background color */
  screenBg?: string;
}

const frameColors = {
  dark: { frame: '#1A1A1A', notch: '#111', reflection: 'rgba(255,255,255,0.06)' },
  light: { frame: '#E8E8E8', notch: '#CCC', reflection: 'rgba(255,255,255,0.6)' },
  silver: { frame: '#B0B0B0', notch: '#999', reflection: 'rgba(255,255,255,0.4)' },
};

export function PhoneMockup({
  children,
  width = 280,
  frameColor = 'dark',
  screenBg = colors.bg,
}: PhoneMockupProps) {
  const height = Math.round(width * 2.08);
  const fc = frameColors[frameColor];
  const borderW = Math.round(width * 0.036);
  const innerW = width - borderW * 2;
  const innerH = height - borderW * 2;
  const borderR = Math.round(width * 0.14);
  const innerR = borderR - borderW;

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: borderR,
        backgroundColor: fc.frame,
        boxShadow: `0 0 0 ${borderW * 0.4}px rgba(0,0,0,0.06) inset, 0 20px 60px rgba(0,0,0,0.28), 0 8px 20px rgba(0,0,0,0.18)`,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Reflection sheen */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: borderR,
          background: `linear-gradient(135deg, ${fc.reflection} 0%, transparent 50%)`,
          zIndex: 10,
          pointerEvents: 'none',
        }}
      />
      {/* Screen */}
      <div
        style={{
          position: 'absolute',
          top: borderW,
          left: borderW,
          width: innerW,
          height: innerH,
          borderRadius: innerR,
          backgroundColor: screenBg,
          overflow: 'hidden',
        }}
      >
        {/* Notch / pill */}
        <div
          style={{
            position: 'absolute',
            top: '14px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: Math.round(innerW * 0.28),
            height: Math.round(innerW * 0.05),
            borderRadius: '999px',
            backgroundColor: fc.notch,
            zIndex: 5,
          }}
        />
        {/* Content */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {children ?? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: '8px',
                fontFamily: font.family,
                color: colors.muted,
              }}
            >
              <span style={{ fontSize: '28px' }}>📱</span>
              <span style={{ fontSize: font.size.sm }}>App Preview</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
