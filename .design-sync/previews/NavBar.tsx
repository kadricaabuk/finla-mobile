import React from 'react';
import { NavBar } from 'finla-web-ds';

export const Default = () => (
  <div style={{ width: '100%' }}>
    <NavBar />
  </div>
);

export const WithActiveLink = () => (
  <div style={{ width: '100%' }}>
    <NavBar
      links={[
        { label: 'Özellikler', active: true },
        { label: 'Fiyatlar' },
        { label: 'Blog' },
        { label: 'Hakkımızda' },
      ]}
      cta="Ücretsiz Dene"
    />
  </div>
);
