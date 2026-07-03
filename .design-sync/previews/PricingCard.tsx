import React from 'react';
import { PricingCard } from 'finla-web-ds';

export const Starter = () => (
  <div style={{ padding: '24px', maxWidth: '320px' }}>
    <PricingCard
      plan="Başlangıç"
      price="₺199"
      period="/ ay"
      description="Tek kişilik işletmeler için mükemmel"
      features={[
        'Aylık 50 fatura',
        'GİB entegrasyonu',
        'Yapay zeka sohbeti',
        'E-posta desteği',
      ]}
      cta="Başla"
    />
  </div>
);

export const Pro = () => (
  <div style={{ padding: '24px', maxWidth: '320px' }}>
    <PricingCard
      plan="Profesyonel"
      price="₺499"
      period="/ ay"
      description="Büyüyen işletmeler için eksiksiz çözüm"
      features={[
        'Sınırsız fatura',
        'GİB entegrasyonu',
        'Yapay zeka sohbeti',
        'Excel & PDF dışa aktarım',
        'Öncelikli destek',
        'API erişimi',
      ]}
      cta="Ücretsiz Dene"
      highlighted
    />
  </div>
);

export const Comparison = () => (
  <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', maxWidth: '900px' }}>
    <PricingCard
      plan="Başlangıç"
      price="₺199"
      period="/ ay"
      features={['Aylık 50 fatura', 'GİB entegrasyonu', 'E-posta desteği']}
      cta="Başla"
    />
    <PricingCard
      plan="Profesyonel"
      price="₺499"
      period="/ ay"
      features={['Sınırsız fatura', 'GİB entegrasyonu', 'API erişimi', 'Öncelikli destek']}
      cta="Ücretsiz Dene"
      highlighted
      badge="En Popüler"
    />
    <PricingCard
      plan="Kurumsal"
      price="Özel"
      period=""
      description="Büyük ekipler için özel fiyatlandırma"
      features={['Sınırsız her şey', 'Özel entegrasyon', 'SLA garantisi', 'Hesap yöneticisi']}
      cta="İletişime Geç"
    />
  </div>
);
