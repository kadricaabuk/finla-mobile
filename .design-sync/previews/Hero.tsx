import React from 'react';
import { Hero } from 'finla-web-ds';

export const Split = () => (
  <div style={{ width: '100%', background: '#fff' }}>
    <Hero layout="split" />
  </div>
);

export const Centered = () => (
  <div style={{ width: '100%', background: '#fff' }}>
    <Hero
      layout="centered"
      badge="Türkiye'nin e-fatura asistanı"
      headline="Faturalarınızı yapay zeka ile yönetin"
      subheadline="Finla, GİB sistemine doğrudan bağlanır. Sohbet ederek fatura kesin, sorgulayın ve analiz edin."
      primaryCta="Ücretsiz Dene"
      secondaryCta="Nasıl Çalışır?"
    />
  </div>
);

export const WithoutSecondaryCta = () => (
  <div style={{ width: '100%', background: '#fff' }}>
    <Hero
      layout="centered"
      badge="GİB entegrasyonu hazır"
      headline="Fatura kesmek artık çok kolay"
      subheadline="Telefon numaranızla kayıt olun, GİB hesabınızı bağlayın, dakikalar içinde başlayın."
      primaryCta="Başla"
    />
  </div>
);
