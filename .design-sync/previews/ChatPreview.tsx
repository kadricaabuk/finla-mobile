import React from 'react';
import { ChatPreview } from 'finla-web-ds';

export const Default = () => (
  <div style={{ padding: '24px', maxWidth: '420px' }}>
    <ChatPreview />
  </div>
);

export const Compact = () => (
  <div style={{ padding: '24px', maxWidth: '340px' }}>
    <ChatPreview compact />
  </div>
);

export const CustomMessages = () => (
  <div style={{ padding: '24px', maxWidth: '420px' }}>
    <ChatPreview
      messages={[
        { role: 'user', text: 'Geçen ay kesen faturaları listele' },
        { role: 'assistant', text: 'Mayıs 2025\'te 8 fatura kesildi, toplam 28.450 ₺. İstersen müşteri bazında da gösterebilirim.' },
        { role: 'user', text: 'ABC Mühendislik\'e fatura kes, 12.000 ₺ + KDV' },
        { role: 'assistant', text: 'ABC Mühendislik\'e 12.000 ₺ + 2.160 ₺ KDV = 14.160 ₺ tutarında e-fatura hazırlandı. Onaylıyor musunuz?' },
      ]}
    />
  </div>
);
