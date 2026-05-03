import type Anthropic from 'npm:@anthropic-ai/sdk'
import type { FinlaFeatures } from './feature-config.ts'

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
    name: 'update_user_profile',
    description:
      'GİB e-Arşiv portalındaki kullanıcı profil kaydını günceller (ünvan, ad-soyad, iletişim, adres vb.). Sadece kullanıcı bilgi değişikliği istediğinde ve hangi alanların değişeceği belli olduğunda çağır; en az bir alan dolu olmalı. VKN/TCKN değişikliği çoğu zaman kısıtlıdır.',
    input_schema: {
      type: 'object',
      properties: {
        taxIDOrTRID: { type: 'string', description: 'Vergi veya TC kimlik no' },
        title: { type: 'string', description: 'Ticari ünvan' },
        name: { type: 'string', description: 'Ad' },
        surname: { type: 'string', description: 'Soyad' },
        registryNo: { type: 'string', description: 'Sicil no' },
        mersisNo: { type: 'string', description: 'MERSİS no' },
        taxOffice: { type: 'string', description: 'Vergi dairesi' },
        fullAddress: { type: 'string', description: 'Tam adres metni' },
        buildingName: { type: 'string', description: 'Apartman/bina adı' },
        buildingNumber: { type: 'string', description: 'Bina no' },
        doorNumber: { type: 'string', description: 'Kapı no' },
        town: { type: 'string', description: 'İlçe / kasaba' },
        district: { type: 'string', description: 'Semt / mahalle' },
        city: { type: 'string', description: 'İl' },
        zipCode: { type: 'string', description: 'Posta kodu' },
        country: { type: 'string', description: 'Ülke' },
        phoneNumber: { type: 'string', description: 'Telefon' },
        faxNumber: { type: 'string', description: 'Faks' },
        email: { type: 'string', description: 'E-posta' },
        webSite: { type: 'string', description: 'Web sitesi' },
        businessCenter: { type: 'string', description: 'İş merkezi' },
      },
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
    name: 'list_invoices_received',
    description:
      'GİB e-Arşivde bana kesilen (gelen) e-faturaları listeler — getAllInvoicesIssuedToMeByDateRange. Tarih verilmezse kullanıcı ifadesinden (ör. bu ay) aralık belirlenir. Kesilen (müşteriye) faturalar için list_invoices kullan.',
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
          description:
            'Opsiyonel tedarikçi/gönderici adı veya unvan filtresi (faturayı kesen taraf)',
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
    name: 'export_invoices_excel',
    description:
      'Fatura listesini Excel (.xlsx) olarak üretir; kullanıcı sohbette indirip paylaşabilir. Kesilen (müşteriye) veya gelen (bana kesilen) faturalar için direction kullan. Tarih verilmezse kullanıcı ifadesinden (ör. bu ay, son 1 ay) aralık belirlenir. Excel, csv veya dışa aktarma istenen her durumda bu aracı tercih et.',
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
        direction: {
          type: 'string',
          enum: ['outgoing', 'incoming'],
          description:
            'outgoing = kestiğim faturalar; incoming = gelen (bana kesilen) faturalar',
        },
        customer_name: {
          type: 'string',
          description:
            'Opsiyonel cari adı/unvan filtresi (yön outgoing ise müşteri, incoming ise gönderici)',
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

/** `FEATURES` bayraklarına göre Claude sistem mesajını üretir. */
export function assembleSystemPrompt(f: FinlaFeatures): string {
  const previewHints: string[] = []
  if (f.outgoingInvoices) {
    previewHints.push(
      'önce latest_invoice ile ETTN/UUID bağlamını netleştir ve kullanıcıyı çıkan önizleme / paylaşım adımına yönlendir',
    )
  }
  if (f.incomingInvoices) {
    previewHints.push('gelen fatura sorularında list_invoices_received sonucundan yararlan')
  }
  const previewSuffix = previewHints.length > 0
    ? previewHints.join('; ') + '.'
    : 'uygulama bağlam oluştuğunda HTML önizleme sunabilir.'
  const previewBlock =
    `Önizleme / PDF: Kullanıcı faturanın tam görünümünü, PDF veya önizleme isterse uygulama sohbette düğümle HTML önizleme ve paylaşılabilir çıktı sunar (GİB HTML). PDF veya önizlemenin uygulamada mümkün olmadığını söyleme — ${previewSuffix}`

  const capabilityLines: string[] = []
  if (f.outgoingInvoices) {
    capabilityLines.push('- Fatura oluşturma (create_invoice)')
    capabilityLines.push('- Fatura kesim onayı (confirm_invoice_issue)')
    capabilityLines.push('- İmzalama SMS gönderimi (request_invoice_sign_otp)')
    capabilityLines.push('- İmzalama SMS doğrulaması (verify_invoice_sign_otp)')
    capabilityLines.push(
      '- Fatura listeleme — kestiğin faturalar (list_invoices)',
    )
    capabilityLines.push('- Toplam satış/KDV özeti (invoice_totals)')
    capabilityLines.push('- Son faturayı bulma (latest_invoice)')
    capabilityLines.push('- Fatura iptal etme (cancel_invoice)')
    capabilityLines.push('- Alıcı bilgisi sorgulama (lookup_recipient)')
  }
  if (f.incomingInvoices) {
    capabilityLines.push(
      '- Gelen faturaları listeleme — sana kesilen e-faturalar (list_invoices_received)',
    )
  }
  if (f.outgoingInvoices || f.incomingInvoices) {
    capabilityLines.push(
      '- Fatura Excel dışa aktarma (export_invoices_excel): kullanıcı excel, csv veya dışarı aktarma isterse bu araçla .xlsx üret (direction ile giden/gelen seç)',
    )
  }
  if (f.profile) {
    capabilityLines.push('- Kullanıcı profil bilgisi (get_user_profile)')
    capabilityLines.push(
      '- GİB profil kaydı güncelleme (update_user_profile)',
    )
  }

  const ruleLines: string[] = [
    '- Türkçe yanıt ver',
    '- Kısa ve doğal konuşma dili kullan',
  ]

  if (f.profile) {
    ruleLines.push(
      `- Kullanıcı "profilim", "firma bilgilerim", "kullanıcı bilgilerim", "bilgilerimi getir" gibi bir istek yazarsa mutlaka get_user_profile aracını çağır.`,
    )
    ruleLines.push(
      `- Telefon, adres, e-posta veya ünvan gibi GİB profil bilgisini değiştirmek istediğinde önce get_user_profile ile mevcut kaydı doğrula; güncellemeden önce kullanıcıya yapılacak değişikliği özetle ve net onay al; sonra update_user_profile ile sadece değişecek alanları gönder`,
    )
  }
  if (f.outgoingInvoices) {
    ruleLines.push(
      `- Fatura oluşturmadan önce kritik bilgileri (alıcı, tutar, KDV oranı) özetle ve onay al`,
    )
    ruleLines.push(
      `- create_invoice çağrısı sadece önizleme içindir; kullanıcı "onaylıyorum" demeden faturayı kesme`,
    )
    ruleLines.push(
      `- confirm_invoice_issue çağrısından önce SMS doğrulama (request_invoice_sign_otp + verify_invoice_sign_otp) tamamlanmış olmalı`,
    )
  }
  ruleLines.push('- Eksik bilgi varsa soru sor')
  ruleLines.push(
    '- Mali toplamları kendin tahmin etme; mümkünse araç çağrısı sonucu kullan',
  )
  ruleLines.push(
    '- Markdown tablo kullanma; sade cümleler veya kısa maddeler kullan',
  )
  ruleLines.push('- Tarih belirtilmemişse bugünün tarihini kullan')
  ruleLines.push(
    '- "Bu ay", "ayın başından beri", "dün", "geçen hafta" gibi ifadelerde tarih netleştirmesi isteme; doğrudan ilgili aracı çağır',
  )
  ruleLines.push('- Hata durumlarını kullanıcıya Türkçe açıkla')

  let capabilitiesSection = ''
  if (capabilityLines.length > 0) {
    capabilitiesSection = `Yeteneklerin:\n${capabilityLines.join('\n')}\n\n`
  }

  const intro =
    `Sen "finla" uygulamasının yapay zeka asistanısın. fatura.js entegrasyonu üzerinden GİB e-Arşiv işlemlerinde kullanıcılara yardım ediyorsun.`

  return `${intro}

${previewBlock}

${capabilitiesSection}Kurallar:
${ruleLines.join('\n')}`
}
