import {
  buildLocalDraftPreviewHtml,
  todayGibApiFormatted,
  type CreateInvoiceInput,
} from '../invoice-mapper.ts'
import type {
  InvoiceDraftRef,
  InvoiceProvider,
  InvoiceProviderContext,
  RecipientLookupResult,
} from './types.ts'

const MOCK_EFATURA_VKN = '6271036106'

function mockRecipient(taxId: string): RecipientLookupResult {
  const isEfatura = taxId === MOCK_EFATURA_VKN || taxId.length === 10
  return {
    tax_id: taxId,
    name: isEfatura ? 'MYSOFT DİJİTAL DÖNÜŞÜM A.Ş. TEST' : 'UĞUR YILMAZ',
    is_efatura: isEfatura,
    pk_alias: isEfatura ? 'urn:mail:adpk@ds.com' : undefined,
    tax_office: 'ESENLER',
    address: 'İstanbul',
  }
}

function mockOutgoingList(tenantVkn?: string): unknown[] {
  const today = todayGibApiFormatted().replace(/\//g, '/')
  return [
    {
      ettn: 'mock-ettn-001',
      faturaTarihi: today,
      aliciUnvan: 'Test Alıcı A.Ş.',
      aliciVknTckn: '1234567890',
      vergilerDahilToplamTutar: '1180,00',
      malhizmetToplamTutari: '1000,00',
      paraBirimi: 'TRY',
      onayDurumu: 'Onaylandı',
      belgeTuru: 'EARSIVFATURA',
    },
    {
      ettn: 'mock-ettn-002',
      faturaTarihi: today,
      aliciUnvan: 'Mock Müşteri Ltd.',
      aliciVknTckn: tenantVkn ?? MOCK_EFATURA_VKN,
      vergilerDahilToplamTutar: '590,00',
      malhizmetToplamTutari: '500,00',
      paraBirimi: 'TRY',
      onayDurumu: 'Taslak',
      belgeTuru: 'EFATURA',
    },
  ]
}

export const mockInvoiceProvider: InvoiceProvider = {
  async lookupRecipient(_ctx, taxId) {
    const id = taxId.replace(/\s/g, '')
    if (!/^\d{10,11}$/.test(id)) return null
    return mockRecipient(id)
  },

  async createInvoicePreview(_ctx, input) {
    const draft: InvoiceDraftRef = {
      uuid: crypto.randomUUID(),
      date: input.date ?? todayGibApiFormatted(),
    }
    const html = buildLocalDraftPreviewHtml({
      buyer_name: input.buyerName,
      buyer_tax_id: input.buyerTaxId,
      date: input.date,
      currency: input.currency,
      items: input.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unitPrice,
        vat_rate: i.vatRate,
      })),
    })
    return { draft, html }
  },

  async confirmInvoiceIssue(_ctx, draft, _options?) {
    const html = `<!DOCTYPE html><html><body><h1>Mock Fatura Kesildi</h1><p>ETTN: ${draft.uuid}</p></body></html>`
    return { uuid: draft.uuid, html }
  },

  async getInvoicePreview(_ctx, { invoiceUuid, signed, direction }) {
    if (direction === 'incoming') {
      const html = `<!DOCTYPE html><html><body><h1>Mock Gelen Fatura</h1><p>ETTN: ${invoiceUuid}</p><p>Gerçek ortamda PDF önizleme gösterilir.</p></body></html>`
      return { html, local_fallback: true }
    }
    const title = signed ? 'Mock Kesilmiş Fatura' : 'Mock Taslak Fatura'
    const html = `<!DOCTYPE html><html><body><h1>${title}</h1><p>ETTN: ${invoiceUuid}</p></body></html>`
    return { html, local_fallback: true }
  },

  async listOutgoingInvoices(ctx, _start, _end) {
    return mockOutgoingList(ctx.tenantVkn)
  },

  async listIncomingInvoices(_ctx, _start, _end) {
    const today = todayGibApiFormatted();
    return [
      {
        ettn: 'mock-incoming-001',
        faturaTarihi: today,
        gondericiUnvan: 'Tedarikçi A.Ş.',
        gondericiVknTckn: '9876543210',
        vergilerDahilToplamTutar: '2360,00',
        malhizmetToplamTutari: '2000,00',
        paraBirimi: 'TRY',
        onayDurumu: 'Kabul',
      },
      {
        ettn: 'mock-incoming-002',
        faturaTarihi: today,
        gondericiUnvan: 'Ofis Malzemeleri Ltd.',
        gondericiVknTckn: '1122334455',
        vergilerDahilToplamTutar: '1180,00',
        malhizmetToplamTutari: '1000,00',
        paraBirimi: 'TRY',
        onayDurumu: 'Kabul',
      },
      {
        ettn: 'mock-incoming-003',
        faturaTarihi: today,
        gondericiUnvan: 'Enerji Hizmetleri A.Ş.',
        gondericiVknTckn: '5566778899',
        vergilerDahilToplamTutar: '5900,00',
        malhizmetToplamTutari: '5000,00',
        paraBirimi: 'TRY',
        onayDurumu: 'Yanıt Bekleniyor',
      },
    ]
  },

  async cancelInvoice(_ctx, ettn, reason) {
    return { ettn, status: 'cancelled', reason }
  },

  async acceptIncomingInvoice() {
    throw new Error('Gelen fatura yanıtı mock modda desteklenmiyor.')
  },

  async rejectIncomingInvoice() {
    throw new Error('Gelen fatura yanıtı mock modda desteklenmiyor.')
  },

  async getUserProfile(ctx) {
    return {
      taxIDOrTRID: ctx.tenantVkn ?? '',
      title: ctx.tenantVkn ? `Firma ${ctx.tenantVkn}` : '',
      phoneNumber: ctx.phone ?? '',
      email: '',
      fullAddress: '',
      country: 'Türkiye',
    }
  },
}

export function isMockMode(): boolean {
  const explicit = Deno.env.get('MYSOFT_MOCK')?.toLowerCase()
  if (explicit === 'true') return true
  if (explicit === 'false') return false
  const user = Deno.env.get('MYSOFT_USERNAME')?.trim()
  const pass = Deno.env.get('MYSOFT_PASSWORD')?.trim()
  return !user || !pass
}
