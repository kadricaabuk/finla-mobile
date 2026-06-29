import React from 'react';
import { InvoicePreviewCard } from 'finla-web-ds';

export const Approved = () => (
  <div style={{ padding: '20px', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <InvoicePreviewCard
      customerName="ABC Mühendislik A.Ş."
      amount="14.160,00 ₺"
      date="15 Haz 2025"
      invoiceNumber="FTR2025000042"
      status="approved"
    />
    <InvoicePreviewCard
      customerName="XYZ Yazılım Ltd. Şti."
      amount="5.900,00 ₺"
      date="12 Haz 2025"
      invoiceNumber="FTR2025000041"
      status="approved"
    />
  </div>
);

export const AllStatuses = () => (
  <div style={{ padding: '20px', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <InvoicePreviewCard customerName="Onaylı Müşteri A.Ş." amount="8.500,00 ₺" date="10 Haz 2025" status="approved" />
    <InvoicePreviewCard customerName="Bekleyen Sipariş Ltd." amount="3.200,00 ₺" date="9 Haz 2025" status="pending" />
    <InvoicePreviewCard customerName="Reddedilen İşlem A.Ş." amount="15.000,00 ₺" date="8 Haz 2025" status="rejected" />
    <InvoicePreviewCard customerName="İptal Edilen Kayıt" amount="1.100,00 ₺" date="7 Haz 2025" status="cancelled" />
  </div>
);

export const Incoming = () => (
  <div style={{ padding: '20px', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <InvoicePreviewCard
      customerName="Tedarikçi Firma A.Ş."
      amount="22.900,00 ₺"
      date="14 Haz 2025"
      invoiceNumber="TEP2025000018"
      status="approved"
      direction="incoming"
    />
    <InvoicePreviewCard
      customerName="Ofis Malzemeleri Ltd."
      amount="4.720,00 ₺"
      date="11 Haz 2025"
      status="pending"
      direction="incoming"
    />
  </div>
);
