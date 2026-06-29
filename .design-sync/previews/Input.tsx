import React from 'react';
import { Input } from 'finla-web-ds';

export const Default = () => (
  <div style={{ padding: '24px', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <Input label="Telefon" placeholder="0555 123 45 67" type="tel" />
    <Input label="Şifre" placeholder="Şifrenizi girin" type="password" />
  </div>
);

export const States = () => (
  <div style={{ padding: '24px', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <Input label="E-posta" placeholder="ornek@firma.com" type="email" />
    <Input label="VKN / TCKN" placeholder="10 veya 11 hane" hint="Vergi Kimlik Numaranızı girin" />
    <Input label="Devre Dışı" placeholder="Düzenlenemez" disabled />
    <Input label="Hatalı alan" placeholder="Değer girin" error="Bu alan zorunludur" />
  </div>
);

export const LoginForm = () => (
  <div style={{ padding: '28px', maxWidth: '380px', background: '#fff', borderRadius: '14px', border: '1px solid #F0F0F0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
    <div style={{ fontFamily: 'system-ui', fontWeight: 700, fontSize: '22px', letterSpacing: '-0.5px', marginBottom: '4px' }}>
      finla
    </div>
    <Input label="Telefon" placeholder="0555 123 45 67" type="tel" />
    <Input label="Şifre" placeholder="••••••••" type="password" />
  </div>
);
