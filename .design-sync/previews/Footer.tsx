import React from 'react';
import { Footer } from 'finla-web-ds';

export const Default = () => (
  <div style={{ width: '100%' }}>
    <Footer />
  </div>
);

export const Minimal = () => (
  <div style={{ width: '100%' }}>
    <Footer
      description="GİB e-fatura yönetimi için yapay zeka asistanı."
      linkGroups={[
        { heading: 'Ürün', links: [{ label: 'Özellikler' }, { label: 'Fiyatlar' }] },
        { heading: 'Yasal', links: [{ label: 'Gizlilik' }, { label: 'Şartlar' }] },
      ]}
      copyright="© 2025 Finla"
    />
  </div>
);
