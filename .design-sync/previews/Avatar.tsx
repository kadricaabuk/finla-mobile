import React from 'react';
import { Avatar } from 'finla-web-ds';

export const Sizes = () => (
  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', padding: '24px' }}>
    <Avatar initial="A" size="sm" />
    <Avatar initial="B" size="md" />
    <Avatar initial="C" size="lg" />
    <Avatar initial="D" size="xl" />
  </div>
);

export const WithNames = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '24px' }}>
    {[
      { initial: 'A', name: 'Ahmet Yılmaz', sub: 'VKN: 1234567890' },
      { initial: 'M', name: 'Mehmet Kaya', sub: 'VKN: 9876543210' },
      { initial: 'F', name: 'Fatma Demir', sub: 'GİB Hesabı' },
    ].map((u) => (
      <div key={u.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'system-ui' }}>
        <Avatar initial={u.initial} size="md" />
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#000' }}>{u.name}</div>
          <div style={{ fontSize: '11px', color: '#ABABAB', marginTop: '1px' }}>{u.sub}</div>
        </div>
      </div>
    ))}
  </div>
);
