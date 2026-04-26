import type Anthropic from 'npm:@anthropic-ai/sdk'

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'lookup_recipient',
    description:
      'TC Kimlik No veya Vergi Kimlik No ile alıcı bilgilerini GİB sisteminden getirir. Fatura kesmeden önce alıcı bilgilerini doğrulamak için kullan.',
    input_schema: {
      type: 'object',
      properties: {
        tax_id: {
          type: 'string',
          description: 'Alıcının TC Kimlik No (11 hane) veya Vergi Kimlik No (10 hane)',
        },
      },
      required: ['tax_id'],
    },
  },
  {
    name: 'create_invoice',
    description:
      'GİB e-Arşiv sisteminde yeni bir fatura oluşturur. Eksik bilgi varsa önce kullanıcıya sor.',
    input_schema: {
      type: 'object',
      properties: {
        buyer_name: {
          type: 'string',
          description: 'Alıcının adı, soyadı veya ticari ünvanı',
        },
        buyer_tax_id: {
          type: 'string',
          description: 'Alıcının TC Kimlik No veya Vergi Kimlik No (opsiyonel)',
        },
        buyer_address: {
          type: 'string',
          description: 'Alıcının adresi (opsiyonel)',
        },
        items: {
          type: 'array',
          description: 'Fatura kalemleri',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Ürün veya hizmet adı' },
              quantity: { type: 'number', description: 'Miktar' },
              unit: {
                type: 'string',
                description: 'Birim: ADET, KG, SAAT, GÜN, METRE, LITRE, KUTU, vb.',
              },
              unit_price: {
                type: 'number',
                description: 'Birim fiyat (KDV hariç, TL cinsinden)',
              },
              vat_rate: {
                type: 'number',
                description: 'KDV oranı: 0, 1, 10 veya 20',
                enum: [0, 1, 10, 20],
              },
            },
            required: ['name', 'quantity', 'unit', 'unit_price', 'vat_rate'],
          },
        },
        date: {
          type: 'string',
          description: 'Fatura tarihi GG/AA/YYYY formatında. Belirtilmezse bugünün tarihi kullanılır.',
        },
        currency: {
          type: 'string',
          description: 'Para birimi',
          enum: ['TRY', 'USD', 'EUR'],
        },
      },
      required: ['buyer_name', 'items'],
    },
  },
  {
    name: 'list_invoices',
    description: 'GİB e-Arşiv sistemindeki faturaları tarih aralığına göre listeler.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Başlangıç tarihi GG/AA/YYYY formatında',
        },
        end_date: {
          type: 'string',
          description: 'Bitiş tarihi GG/AA/YYYY formatında',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'cancel_invoice',
    description:
      'Taslak durumundaki bir faturayı ETTN numarasıyla iptal eder. Önce list_invoices ile ETTN numarasını öğren.',
    input_schema: {
      type: 'object',
      properties: {
        ettn: {
          type: 'string',
          description: 'İptal edilecek faturanın ETTN numarası',
        },
        reason: {
          type: 'string',
          description: 'İptal sebebi',
        },
      },
      required: ['ettn'],
    },
  },
]

export const SYSTEM_PROMPT = `Sen "finla" uygulamasının yapay zeka asistanısın. GİB e-Arşiv sistemi üzerinden Türk e-fatura oluşturma ve yönetme işlemlerinde kullanıcılara yardım ediyorsun.

Yeteneklerin:
- Fatura oluşturma (create_invoice)
- Fatura listeleme (list_invoices)
- Fatura iptal etme (cancel_invoice)
- Alıcı bilgisi sorgulama (lookup_recipient)

Kurallar:
- Türkçe yanıt ver
- Kısa ve net ol
- Fatura oluşturmadan önce kritik bilgileri (alıcı, tutar, KDV oranı) özetle ve onay al
- Eksik bilgi varsa soru sor
- KDV hesaplamalarını kendin yap ve özetle
- Tarih belirtilmemişse bugünün tarihini kullan
- Hata durumlarını kullanıcıya Türkçe açıkla`
