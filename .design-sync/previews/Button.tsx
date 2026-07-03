import React from 'react';
import { Button } from 'finla-web-ds';

export const Primary = () => (
  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '24px' }}>
    <Button variant="primary" size="sm">Küçük</Button>
    <Button variant="primary" size="md">Orta</Button>
    <Button variant="primary" size="lg">Büyük</Button>
  </div>
);

export const Secondary = () => (
  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '24px' }}>
    <Button variant="secondary" size="sm">Küçük</Button>
    <Button variant="secondary" size="md">Orta</Button>
    <Button variant="secondary" size="lg">Büyük</Button>
  </div>
);

export const Ghost = () => (
  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '24px' }}>
    <Button variant="ghost" size="sm">İptal</Button>
    <Button variant="ghost" size="md">Daha Fazla</Button>
    <Button variant="ghost" size="lg">Geri Dön</Button>
  </div>
);

export const States = () => (
  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '24px' }}>
    <Button variant="primary" size="md">Aktif</Button>
    <Button variant="primary" size="md" disabled>Devre Dışı</Button>
    <Button variant="primary" size="md" fullWidth>Tam Genişlik</Button>
  </div>
);

export const CTAPair = () => (
  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '24px' }}>
    <Button variant="primary" size="lg">Ücretsiz Başla</Button>
    <Button variant="secondary" size="lg">Demo İzle</Button>
  </div>
);
