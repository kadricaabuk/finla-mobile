import React from 'react';
import { FeatureCard } from 'finla-web-ds';

export const Default = () => (
  <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', maxWidth: '680px' }}>
    <FeatureCard
      icon="🤖"
      title="Yapay Zeka Asistanı"
      description="Faturalarınızı doğal dilde sorgulayın. 'Bu ay kesen faturalar neler?' gibi sorular sorun."
    />
    <FeatureCard
      icon="⚡"
      title="Anında Fatura Kes"
      description="Müşteri adını ve tutarı söyleyin; Finla faturayı hazırlasın, siz onaylayın."
    />
    <FeatureCard
      icon="🔒"
      title="GİB Entegrasyonu"
      description="GİB sistemine doğrudan bağlanır. Kimlik bilgileriniz şifreli vault'ta saklanır."
    />
    <FeatureCard
      icon="📊"
      title="Otomatik Raporlama"
      description="Aylık ciro, KDV özeti ve müşteri bazlı analizleri saniyeler içinde alın."
    />
  </div>
);

export const Outline = () => (
  <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', maxWidth: '680px' }}>
    <FeatureCard icon="📱" title="Mobil Uygulama" description="iPhone ve Android'de sorunsuz çalışır." variant="outline" />
    <FeatureCard icon="🌐" title="Web Arayüzü" description="Masaüstünden de erişin, her yerde senkron." variant="outline" />
  </div>
);

export const Filled = () => (
  <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', maxWidth: '680px' }}>
    <FeatureCard icon="✅" title="Kurulumu Kolay" description="5 dakikada kurulum. Teknik bilgi gerekmez." variant="filled" />
    <FeatureCard icon="🏦" title="GİB Onaylı" description="Resmi GİB API entegrasyonu ile güvenli fatura." variant="filled" />
  </div>
);
