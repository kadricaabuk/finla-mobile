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
    name: 'get_exchange_rate',
    description:
      'TCMB döviz satış kurunu getirir (1 USD/EUR kaç TL). Dövizli fatura öncesi kur bilgisini kullanıcıya göstermek için kullan.',
    input_schema: {
      type: 'object',
      properties: {
        currency: {
          type: 'string',
          description: 'Para birimi',
          enum: ['USD', 'EUR'],
        },
        date: {
          type: 'string',
          description:
            'Fatura tarihi GG/AA/YYYY. Belirtilmezse bugünün TCMB kuru kullanılır.',
        },
      },
      required: ['currency'],
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
          description:
            'Alıcının TC Kimlik No veya Vergi Kimlik No (opsiyonel). Kullanıcı TCKN/VKN vermek istemezse bu alanı gönderme.',
        },
        buyer_address: {
          type: 'string',
          description: 'Alıcının adresi (opsiyonel)',
        },
        tax_office: {
          type: 'string',
          description:
            'Alıcının vergi dairesi (opsiyonel; lookup_recipient sonucundan geçilebilir)',
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
                description:
                  'Ölçü birimi (Türkçe veya GİB kodu): adet, kg, saat, gün, litre, metre, kutu vb. Sistem GİB koduna çevirir (ör. adet→C62, saat→HUR, kg→KGM).',
              },
              unit_price: {
                type: 'number',
                description: 'Birim fiyat (KDV hariç; currency alanındaki para biriminde)',
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
        exchange_rate: {
          type: 'string',
          description:
            'Onaylanmış kur: 1 birim dövizin TL karşılığı. Belirtilmezse TCMB kuru otomatik çekilir ve kullanıcı onayı istenir.',
        },
      },
      required: ['buyer_name', 'items'],
    },
  },
  {
    name: 'confirm_invoice_issue',
    description:
      'Hazır bekleyen fatura taslağını onaylayıp Mysoft üzerinden GİB\'e gönderir (sendDraftInvoiceToGIB). Kullanıcı açıkça onay verdiyse çağır; SMS doğrulama gerekmez.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_invoices',
    description:
      'Giden veya gelen faturaları listeler (direction ile). Tarih verilmezse kullanıcı ifadesinden (bugün, bu ay, dün) aralık belirlenir. Yanıt: { count, start_date, end_date, direction, invoices }.',
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
        direction: {
          type: 'string',
          enum: ['outgoing', 'incoming'],
          description:
            'outgoing: kestiğin giden faturalar; incoming: sana gelen (gider) faturalar. Varsayılan: outgoing',
        },
      },
      required: [],
    },
  },
  {
    name: 'export_invoices_excel',
    description:
      'Kestiğin fatura listesini Excel (.xlsx) olarak üretir; kullanıcı sohbette indirip paylaşabilir. Tarih verilmezse kullanıcı ifadesinden (ör. bu ay, son 1 ay) aralık belirlenir. Excel, csv veya dışa aktarma istenen her durumda bu aracı tercih et.',
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
        direction: {
          type: 'string',
          enum: ['outgoing', 'incoming'],
          description:
            'outgoing: kestiğin giden faturalar; incoming: sana gelen faturalar. Varsayılan: outgoing',
        },
      },
      required: [],
    },
  },
  {
    name: 'invoice_totals',
    description:
      'Belirtilen yönde onaylı/kabul edilmiş faturalar için toplam tutar, KDV ve net özetini getirir. outgoing = satış/gelir; incoming = gider/borç. Tarih verilmezse kullanıcı ifadesinden aralık belirlenir.',
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
        direction: {
          type: 'string',
          enum: ['outgoing', 'incoming'],
          description:
            'outgoing: satış toplamı; incoming: gider/borç toplamı. Varsayılan: outgoing',
        },
      },
      required: [],
    },
  },
  {
    name: 'invoice_financial_summary',
    description:
      'Tek çağrıda gelen (gider) ve giden (gelir) fatura toplamlarını ve net farkı getirir. Kar/zarar veya gider-gelir özeti istendiğinde kullan.',
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
          description: 'Opsiyonel cari adı/unvan filtresi',
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
        direction: {
          type: 'string',
          enum: ['outgoing', 'incoming'],
          description:
            'outgoing: en son kestiğin fatura; incoming: sana gelen en son fatura. Varsayılan: outgoing',
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

/** Claude sistem mesajını üretir (tüm araçlar ve yanıt sözleşmesi kuralları dahil). */
export function assembleSystemPrompt(): string {
  const previewBlock =
    `Önizleme / PDF: Kullanıcı faturanın tam görünümünü, PDF veya önizleme isterse uygulama sohbette düğümle HTML önizleme ve paylaşılabilir çıktı sunar (GİB HTML). PDF veya önizlemenin uygulamada mümkün olmadığını söyleme — önce latest_invoice ile ETTN/UUID bağlamını netleştir ve kullanıcıyı çıkan önizleme / paylaşım adımına yönlendir.`

  const capabilityLines = [
    '- Fatura oluşturma (create_invoice)',
    '- TCMB döviz kuru (get_exchange_rate)',
    '- Fatura kesim onayı (confirm_invoice_issue — Mysoft sendDraftInvoiceToGIB)',
    '- Fatura listeleme — giden veya gelen (list_invoices, direction parametresi)',
    '- Toplam satış/gider özeti (invoice_totals, direction: outgoing veya incoming)',
    '- Gider + gelir + net özeti (invoice_financial_summary): kar/zarar, gider-gelir özeti',
    '- Son faturayı bulma (latest_invoice): giden veya gelen; list_invoices değil',
    '- Fatura iptal etme (cancel_invoice)',
    '- Alıcı bilgisi sorgulama (lookup_recipient)',
    '- Fatura Excel dışa aktarma (export_invoices_excel): kullanıcı excel, csv veya dışarı aktarma isterse bu araçla .xlsx üret',
    '- Kullanıcı profil bilgisi (get_user_profile)',
    '- GİB profil kaydı güncelleme (update_user_profile)',
  ]

  const ruleLines = [
    '- Türkçe yanıt ver',
    '- Kısa ve doğal konuşma dili kullan',
    `- Kullanıcı "profilim", "firma bilgilerim", "kullanıcı bilgilerim", "bilgilerimi getir" gibi bir istek yazarsa mutlaka get_user_profile aracını çağır.`,
    `- Telefon, adres, e-posta veya ünvan gibi GİB profil bilgisini değiştirmek istediğinde önce get_user_profile ile mevcut kaydı doğrula; güncellemeden önce kullanıcıya yapılacak değişikliği özetle ve net onay al; sonra update_user_profile ile sadece değişecek alanları gönder`,
    `- Fatura akışı: (1) create_invoice → Mysoft taslak (isSaveAsDraft), (2) uygulama önizlemeyi açar, (3) kullanıcı "Onayla ve Kes" der → confirm_invoice_issue (Mysoft imzalar ve GİB'e gönderir; kullanıcı SMS girmez)`,
    `- pending taslak varken create_invoice TEKRAR ÇAĞIRMA; kullanıcı "taslağı gör" derse mevcut taslağı aç`,
    `- Fatura oluşturmadan önce kritik bilgileri (alıcı, tutar, KDV oranı) özetle ve onay al`,
    `- create_invoice çağrısı sadece önizleme içindir; kullanıcı "onaylıyorum" demeden faturayı kesme`,
    `- USD veya EUR faturada önce get_exchange_rate ile TCMB kurunu göster; kullanıcı onayladıktan sonra create_invoice çağır ve exchange_rate gönder`,
    `- create_invoice exchange_rate olmadan çağrılırsa TCMB kuru otomatik önerilir; kullanıcı onayı olmadan taslağa geçme`,
    `- Birim alanında Türkçe yaz (adet, saat, kg); sistem GİB koduna çevirir`,
    `- lookup_recipient boş dönerse bu TEST ortamında normal olabilir; TCKN/VKN kayıtlı değil diye create_invoice hatasını açıklama`,
    `- create_invoice başarılı (preview_ready) ise taslak oluşmuştur; HTML önizleme alınamasa bile kullanıcı onaylayıp kesebilir`,
    `- create_invoice INVALID_INVOICE_DATA hatasında birim kodu veya tarih formatı sorunudur; alıcı kimlik numarasını suçlama`,
    `- confirm_invoice_issue: kullanıcı onayladıysa doğrudan çağır; Mysoft sunucuda mali mühür imzasını yapar`,
    '- Eksik bilgi varsa soru sor',
    '- Mali toplamları kendin tahmin etme; mümkünse araç çağrısı sonucu kullan',
    '- Markdown tablo kullanma; sade cümleler veya kısa maddeler kullan',
    '- Tarih belirtilmemişse bugünün tarihini kullan',
  ]

  const responseContract = [
    `Yanıt stili:`,
    `- Konuşma dili kullan; rapor/excel dili kullanma.`,
    `- Zorunlu sabit başlıklar ("İstek", "Sonuç", "Tarih Aralığı", "Sonraki Adım") kullanma.`,
    `- Gerekirse tarihi cümle içinde doğalca belirt.`,
    `- Tutar/KDV gibi sayısal değerleri sadece araç sonucundan kullan; tahmin etme.`,
    `- Markdown tablo kullanma; gerekiyorsa kısa madde listesi kullan.`,
    `- Kullanıcı "bu ay", "ayın başından beri", "dün", "geçen hafta" derse tarih sormadan ilgili aracı çağır.`,
    `- "gider", "borç", "harcama", "alış" → invoice_totals direction=incoming veya invoice_financial_summary.`,
    `- "kazanç", "gelir", "satış", "kestiğim" → invoice_totals direction=outgoing.`,
    `- "özet", "kar zarar", "gider ve gelir" → invoice_financial_summary.`,
    `- "gelen fatura", "bana kesilen" → list_invoices direction=incoming.`,
    `- "son fatura", "en son fatura", "X'e son kestiğimiz fatura" → latest_invoice direction=outgoing; "gelen son fatura", "X'ten gelen" → direction=incoming.`,
    `- Gelen fatura kabul/red işlemi chat'ten yapılmaz; kullanıcıyı Gelen Faturalar ekranına yönlendir.`,
    `- Kullanıcı az önce konuşulan faturayı "göster", "pdf", "önizle" derse yeni liste açma; sohbet bağlamındaki son faturayı aç.`,
    `- Müşteri adı birden fazla kişiye denk gelirse (ör. iki farklı "Ege") adayları listele ve hangisini istediğini sor.`,
    `- Cevabı kısa tut (genelde 2-5 cümle).`,
    ``,
    `Fatura arama/filtreleme:`,
    `- Fatura kesim akışı: (1) create_invoice ile Mysoft taslağı, (2) önizleme, (3) confirm_invoice_issue ile GİB'e gönderim.`,
    `- Taslak zaten varsa (preview_ready) create_invoice TEKRAR ÇAĞIRMA; kullanıcıya mevcut taslağı önizle.`,
    `- Kullanıcı "taslağı gör", "önizle", "pdf" derse yeni taslak oluşturma; mevcut pending taslak varsa onu aç.`,
    `- list_invoices aracından boş sonuç gelirse, kullanılan tarih ve filtre kriterlerini kullanıcıya bildir (örnek: "Ahmet için bu ay fatura bulunamadı").`,
    `- Kullanıcı excel, csv, xlsx veya "dışarı aktar" isterse export_invoices_excel aracını çağır.`,
    `- Fatura listesi getirince kullanılan tarih aralığını ve varsa filtreleri doğal şekilde belirt.`,
    ``,
    `Hata yönetimi (araç sonucunda "error_code" varsa):`,
    `- INVALID_TAX_ID: "Bu VKN/TCKN geçersiz görünüyor, numarayı kontrol eder misin?" diye sor.`,
    `- INVALID_DATE: "Tarih formatı yanlış — GG/AA/YYYY formatında girer misin?" de.`,
    `- MISSING_EXCHANGE_RATE: USD/EUR fatura için get_exchange_rate ile TCMB kurunu göster veya kullanıcıdan kur iste.`,
    `- EXCHANGE_RATE_CONFIRMATION: create_invoice "exchange_rate_confirmation" döndürürse TCMB kurunu özetle ve onay iste; onaydan sonra aynı parametrelerle exchange_rate göndererek create_invoice tekrar çağır.`,
    `- EXCHANGE_RATE_UNAVAILABLE: TCMB'ye ulaşılamadı; biraz bekle veya manuel kur sor.`,
    `- INVALID_INVOICE_DATA: Birim, kur veya alıcı bilgisinde sorun olabilir; kullanıcıdan eksik bilgiyi netleştir.`,
    `- GIB_UNAVAILABLE: "GİB şu an yanıt vermiyor, biraz bekleyip tekrar deneyelim." de.`,
    `- SESSION_EXPIRED: "Oturumun sona ermiş gibi görünüyor, uygulamayı kapatıp tekrar açmayı dene." de.`,
    `- GIB_ERROR veya diğer: Hata mesajını doğal Türkçe ile özetle, kullanıcı ne yapması gerektiğini açıkla.`,
    `- Hata sonrası ne yapılabileceğini mutlaka belirt; "tekrar deneyin" yerine somut adım öner.`,
  ]

  const intro =
    `Sen "finla" uygulamasının yapay zeka asistanısın. Mysoft EDocument API (sandbox) üzerinden e-Fatura / e-Arşiv işlemlerinde kullanıcılara yardım ediyorsun.`

  return `${intro}

${previewBlock}

Yeteneklerin:
${capabilityLines.join('\n')}

Kurallar:
${ruleLines.join('\n')}

${responseContract.join('\n')}`
}

export function filterToolsWithEphemeralPromptCacheLast(
  allTools: Anthropic.Tool[],
  names: Set<string>,
): Anthropic.Tool[] {
  const filtered = allTools.filter((t) => names.has(t.name));
  if (filtered.length === 0) return filtered;
  return filtered.map((t, i) =>
    i === filtered.length - 1
      ? {
        ...t,
        cache_control: {
          type: "ephemeral",
        } as Anthropic.CacheControlEphemeral,
      }
      : t
  );
}
