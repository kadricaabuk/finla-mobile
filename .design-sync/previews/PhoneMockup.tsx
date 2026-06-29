import React from 'react';
import { PhoneMockup, ChatPreview } from 'finla-web-ds';

export const Dark = () => (
  <div style={{ padding: '32px', background: '#F8F8F8', display: 'flex', justifyContent: 'center' }}>
    <PhoneMockup frameColor="dark" width={260}>
      <ChatPreview compact />
    </PhoneMockup>
  </div>
);

export const Light = () => (
  <div style={{ padding: '32px', background: '#111', display: 'flex', justifyContent: 'center' }}>
    <PhoneMockup frameColor="light" width={260}>
      <ChatPreview compact />
    </PhoneMockup>
  </div>
);

export const Silver = () => (
  <div style={{ padding: '32px', background: '#E8E8E8', display: 'flex', justifyContent: 'center' }}>
    <PhoneMockup frameColor="silver" width={260} />
  </div>
);
