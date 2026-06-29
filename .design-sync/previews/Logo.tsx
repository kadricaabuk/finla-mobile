import React from 'react';
import { Logo } from 'finla-web-ds';

export const Sizes = () => (
  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center', padding: '28px' }}>
    <Logo size="sm" />
    <Logo size="md" />
    <Logo size="lg" />
    <Logo size="xl" />
  </div>
);

export const Variants = () => (
  <div style={{ display: 'flex', gap: '0', flexWrap: 'wrap' }}>
    <div style={{ padding: '28px', background: '#fff', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Logo size="lg" variant="dark" />
    </div>
    <div style={{ padding: '28px', background: '#000', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Logo size="lg" variant="light" />
    </div>
  </div>
);
