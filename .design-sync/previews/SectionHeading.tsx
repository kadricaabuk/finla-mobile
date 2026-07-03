import React from 'react';
import { SectionHeading } from 'finla-web-ds';

export const Centered = () => (
  <div style={{ padding: '48px 28px', background: '#fff' }}>
    <SectionHeading
      eyebrow="Neden Finla?"
      title="Fatura yönetimi bu kadar zor olmak zorunda değil"
      subtitle="GİB sistemine doğrudan bağlanın, yapay zeka ile sorgulayın, tek tıkla fatura kesin."
      align="center"
    />
  </div>
);

export const LeftAligned = () => (
  <div style={{ padding: '48px 28px', background: '#fff' }}>
    <SectionHeading
      eyebrow="Özellikler"
      title="İşletmeniz için tasarlandı"
      subtitle="KOBİ'lerden kurumsal firmalara kadar her ölçekte çalışır."
      align="left"
      size="md"
    />
  </div>
);

export const Minimal = () => (
  <div style={{ padding: '48px 28px', background: '#fff' }}>
    <SectionHeading
      title="Fiyatlandırma"
      align="center"
      size="xl"
    />
  </div>
);
