import type Anthropic from 'npm:@anthropic-ai/sdk'

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_user_profile',
    description:
      'Giriş yapan kullanıcının GİB profil bilgilerini (ünvan, ad-soyad, vergi bilgileri, iletişim/adres) getirir.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'lookup_recipient',
    description:
      'TC Kimlik No veya Vergi Kimlik No ile alıcı bilgilerini fatura.js (GİB e-Arşiv) üzerinden getirir. Fatura kesmeden önce alıcı bilgilerini doğrulamak için kullan.',
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
      'fatura.js üzerinden e-Arşiv için fatura taslağı oluşturur ve önizleme hazırlar. Direkt kesmez.',
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
    name: 'confirm_invoice_issue',
    description:
      'Hazır bekleyen fatura taslağını onaylayıp resmen keser. Sadece kullanıcı açıkça onay verdiyse çağır.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'request_invoice_sign_otp',
    description:
      'Onay bekleyen taslak fatura için GİB imzalama SMS kodu gönderir. Telefon belirtilmezse kullanıcı profilindeki numarayı kullanır.',
    input_schema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Opsiyonel telefon numarası (başında 0 veya ülke koduyla olabilir)',
        },
      },
      required: [],
    },
  },
  {
    name: 'verify_invoice_sign_otp',
    description:
      'İmzalama için gelen SMS OTP kodunu doğrular. Başarılı doğrulamadan sonra fatura kesimi yapılabilir.',
    input_schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Kullanıcının SMS ile aldığı doğrulama kodu',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'list_invoices',
    description:
      'fatura.js (GİB e-Arşiv) sistemindeki faturaları listeler. Tarih verilmezse kullanıcı ifadesinden (ör. bu ay, dün) aralık belirlenir.',
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
        customer_name: {
          type: 'string',
          description: 'Opsiyonel müşteri adı/unvan filtresi (ör. Selcan, test firması)',
        },
        amount_gte: {
          type: 'number',
          description: 'Opsiyonel alt tutar filtresi (>=)',
        },
        amount_eq: {
          type: 'number',
          description: 'Opsiyonel yaklaşık eşit tutar filtresi',
        },
      },
      required: [],
    },
  },
  {
    name: 'invoice_totals',
    description:
      'Onaylı faturalar için toplam satış, toplam KDV ve net tutar özetini getirir. Tarih verilmezse kullanıcı ifadesinden aralık belirlenir.',
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
        customer_name: {
          type: 'string',
          description: 'Opsiyonel müşteri adı/unvan filtresi',
        },
        amount_gte: {
          type: 'number',
          description: 'Opsiyonel alt tutar filtresi (>=)',
        },
        amount_eq: {
          type: 'number',
          description: 'Opsiyonel yaklaşık eşit tutar filtresi',
        },
      },
      required: [],
    },
  },
  {
    name: 'latest_invoice',
    description:
      'Kullanıcının en son faturasını getirir. Gerekirse tarih aralığı verilebilir.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Opsiyonel başlangıç tarihi GG/AA/YYYY formatında',
        },
        end_date: {
          type: 'string',
          description: 'Opsiyonel bitiş tarihi GG/AA/YYYY formatında',
        },
        customer_name: {
          type: 'string',
          description: 'Opsiyonel müşteri adı/unvan filtresi',
        },
        amount_gte: {
          type: 'number',
          description: 'Opsiyonel alt tutar filtresi (>=)',
        },
        amount_eq: {
          type: 'number',
          description: 'Opsiyonel yaklaşık eşit tutar filtresi',
        },
      },
      required: [],
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

export const SYSTEM_PROMPT = `Sen "finla" uygulamasının yapay zeka asistanısın. fatura.js entegrasyonu üzerinden GİB e-Arşiv işlemlerinde kullanıcılara yardım ediyorsun.

Önizleme / PDF: Kullanıcı faturanın tam görünümünü, PDF veya önizleme isterse uygulama sohbette düğümle HTML önizleme ve paylaşılabilir çıktı sunar (GİB HTML). PDF veya önizlemenin uygulamada mümkün olmadığını söyleme — önce latest_invoice ile ETTN/UUID bağlamını netleştir ve kullanıcıyı çıkan önizleme / paylaşım adımına yönlendir.

Yeteneklerin:
- Fatura oluşturma (create_invoice)
- Fatura kesim onayı (confirm_invoice_issue)
- İmzalama SMS gönderimi (request_invoice_sign_otp)
- İmzalama SMS doğrulaması (verify_invoice_sign_otp)
- Fatura listeleme (list_invoices)
- Toplam satış/KDV özeti (invoice_totals)
- Son faturayı bulma (latest_invoice)
- Fatura iptal etme (cancel_invoice)
- Alıcı bilgisi sorgulama (lookup_recipient)
- Kullanıcı profil bilgisi (get_user_profile)

Kurallar:
- Türkçe yanıt ver
- Kısa ve doğal konuşma dili kullan
- Kullanıcı "profilim", "firma bilgilerim", "kullanıcı bilgilerim", "bilgilerimi getir" gibi bir istek yazarsa mutlaka get_user_profile aracını çağır.
- Fatura oluşturmadan önce kritik bilgileri (alıcı, tutar, KDV oranı) özetle ve onay al
- create_invoice çağrısı sadece önizleme içindir; kullanıcı "onaylıyorum" demeden faturayı kesme.
- confirm_invoice_issue çağrısından önce SMS doğrulama (request_invoice_sign_otp + verify_invoice_sign_otp) tamamlanmış olmalı.
- Eksik bilgi varsa soru sor
- Mali toplamları kendin tahmin etme; mümkünse araç çağrısı sonucu kullan
- Markdown tablo kullanma; sade cümleler veya kısa maddeler kullan
- Tarih belirtilmemişse bugünün tarihini kullan
- "Bu ay", "ayın başından beri", "dün", "geçen hafta" gibi ifadelerde tarih netleştirmesi isteme; doğrudan ilgili aracı çağır
- Hata durumlarını kullanıcıya Türkçe açıkla`
