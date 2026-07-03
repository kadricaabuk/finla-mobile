import React from 'react';
import { Badge } from 'finla-web-ds';

export const Variants = () => (
  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '24px' }}>
    <Badge variant="default">Varsayılan</Badge>
    <Badge variant="success">Onaylandı</Badge>
    <Badge variant="error">Reddedildi</Badge>
    <Badge variant="warning">Beklemede</Badge>
    <Badge variant="accent">Yeni</Badge>
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '24px' }}>
    <Badge variant="success" size="sm">Onaylandı</Badge>
    <Badge variant="success" size="md">Onaylandı</Badge>
    <Badge variant="error" size="sm">Hata</Badge>
    <Badge variant="error" size="md">Hata</Badge>
  </div>
);

export const InContext = () => (
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '24px', flexDirection: 'column', alignItems: 'flex-start' }}>
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <span style={{ fontSize: '14px', fontFamily: 'system-ui', color: '#111' }}>GİB e-fatura entegrasyonu</span>
      <Badge variant="accent" size="sm">Hazır</Badge>
    </div>
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <span style={{ fontSize: '14px', fontFamily: 'system-ui', color: '#111' }}>Çoklu firma desteği</span>
      <Badge variant="warning" size="sm">Yakında</Badge>
    </div>
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <span style={{ fontSize: '14px', fontFamily: 'system-ui', color: '#111' }}>API erişimi</span>
      <Badge variant="default" size="sm">Beta</Badge>
    </div>
  </div>
);
