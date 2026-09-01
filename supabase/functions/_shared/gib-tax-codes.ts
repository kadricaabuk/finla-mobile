/**
 * GİB e-Fatura/e-Arşiv vergi kod listeleri.
 *
 * Kaynaklar: KDV Genel Uygulama Tebliği (kısmi tevkifat bölümü I/C-2.1.3),
 * GİB UBL-TR kod listeleri. Oranlar 2026 itibarıyla günceldir; tebliğ
 * değişikliklerinde bu tablo güncellenmelidir.
 */

/**
 * Temmuz 2023'ten beri yürürlükteki KDV oranları (2023/7346 sayılı
 * Cumhurbaşkanı Kararı): genel %20, indirimli %10 ve %1; %0 yalnızca
 * istisna koduyla. Eski oranlar (%18, %8 vb.) reddedilmelidir.
 */
export const VALID_KDV_RATES = [0, 1, 10, 20] as const

export type ValidKdvRate = (typeof VALID_KDV_RATES)[number]

export function isValidKdvRate(rate: number): rate is ValidKdvRate {
  return (VALID_KDV_RATES as readonly number[]).includes(rate)
}

export interface TevkifatCode {
  code: string
  name: string
  /** Tevkifat oranı payı (ör. 9/10 → 9). Yüzde = pay/payda*100. */
  numerator: number
  denominator: number
}

/**
 * Kısmi KDV tevkifatı kodları (GİB e-belge kod listesi 601–627).
 * Oran KDV tutarına uygulanır; alıcı, tevkif edilen kısmı 2 no.lu KDV
 * beyannamesi ile öder.
 */
export const TEVKIFAT_CODES: Record<string, TevkifatCode> = {
  '601': {
    code: '601',
    name:
      'Yapım işleri ile bu işlerle birlikte ifa edilen mühendislik-mimarlık ve etüt-proje hizmetleri',
    numerator: 4,
    denominator: 10,
  },
  '602': {
    code: '602',
    name: 'Etüt, plan-proje, danışmanlık, denetim ve benzeri hizmetler',
    numerator: 9,
    denominator: 10,
  },
  '603': {
    code: '603',
    name:
      'Makine, teçhizat, demirbaş ve taşıtlara ait tadil, bakım ve onarım hizmetleri',
    numerator: 7,
    denominator: 10,
  },
  '604': {
    code: '604',
    name: 'Yemek servis hizmeti',
    numerator: 5,
    denominator: 10,
  },
  '605': {
    code: '605',
    name: 'Organizasyon hizmeti',
    numerator: 5,
    denominator: 10,
  },
  '606': {
    code: '606',
    name: 'İşgücü temin hizmetleri',
    numerator: 9,
    denominator: 10,
  },
  '607': {
    code: '607',
    name: 'Özel güvenlik hizmeti',
    numerator: 9,
    denominator: 10,
  },
  '608': {
    code: '608',
    name: 'Yapı denetim hizmetleri',
    numerator: 9,
    denominator: 10,
  },
  '609': {
    code: '609',
    name:
      'Fason olarak yaptırılan tekstil ve konfeksiyon işleri, çanta ve ayakkabı dikim işleri ve bu işlere aracılık hizmetleri',
    numerator: 7,
    denominator: 10,
  },
  '610': {
    code: '610',
    name: 'Turistik mağazalara verilen müşteri bulma / götürme hizmetleri',
    numerator: 9,
    denominator: 10,
  },
  '611': {
    code: '611',
    name:
      'Spor kulüplerinin yayın, reklam ve isim hakkı gelirlerine konu işlemleri',
    numerator: 9,
    denominator: 10,
  },
  '612': {
    code: '612',
    name: 'Temizlik hizmeti',
    numerator: 9,
    denominator: 10,
  },
  '613': {
    code: '613',
    name: 'Çevre ve bahçe bakım hizmetleri',
    numerator: 9,
    denominator: 10,
  },
  '614': {
    code: '614',
    name: 'Servis taşımacılığı hizmeti',
    numerator: 5,
    denominator: 10,
  },
  '615': {
    code: '615',
    name: 'Her türlü baskı ve basım hizmetleri',
    numerator: 7,
    denominator: 10,
  },
  '616': {
    code: '616',
    name:
      '5018 sayılı Kanuna ekli cetveller kapsamındaki idare, kurum ve kuruluşlara yapılan diğer hizmetler',
    numerator: 5,
    denominator: 10,
  },
  '617': {
    code: '617',
    name: 'Hurda metalden elde edilen külçe teslimleri',
    numerator: 7,
    denominator: 10,
  },
  '618': {
    code: '618',
    name:
      'Hurda metalden elde edilenler dışındaki bakır, çinko ve alüminyum külçe teslimleri',
    numerator: 7,
    denominator: 10,
  },
  '619': {
    code: '619',
    name: 'Bakır, çinko, alüminyum ve kurşun ürünlerinin teslimi',
    numerator: 7,
    denominator: 10,
  },
  '620': {
    code: '620',
    name: 'İstisnadan vazgeçenlerin hurda ve atık teslimi',
    numerator: 7,
    denominator: 10,
  },
  '621': {
    code: '621',
    name:
      'Metal, plastik, lastik, kauçuk, kâğıt, cam hurda ve atıklarından elde edilen hammadde teslimi',
    numerator: 9,
    denominator: 10,
  },
  '622': {
    code: '622',
    name: 'Pamuk, tiftik, yün ve yapağı ile ham post ve deri teslimleri',
    numerator: 9,
    denominator: 10,
  },
  '623': {
    code: '623',
    name: 'Ağaç ve orman ürünleri teslimi',
    numerator: 5,
    denominator: 10,
  },
  '624': {
    code: '624',
    name: 'Yük taşımacılığı hizmeti',
    numerator: 2,
    denominator: 10,
  },
  '625': {
    code: '625',
    name: 'Ticari reklam hizmetleri',
    numerator: 3,
    denominator: 10,
  },
  '626': {
    code: '626',
    name: 'Diğer teslimler',
    numerator: 2,
    denominator: 10,
  },
  '627': {
    code: '627',
    name: 'Demir-çelik ürünlerinin teslimi',
    numerator: 5,
    denominator: 10,
  },
}

/**
 * 2026 kısmi tevkifat alt sınırı: KDV dahil tutarı bu sınırı aşmayan işlemlere
 * tevkifat uygulanmaz (aynı gün aynı alıcıya kesilen faturalar toplamı esas alınır).
 */
export const TEVKIFAT_MIN_GROSS_TRY = 12000

/** KDV istisna kodları (GİB UBL-TR kod listesi; 3xx tam, 2xx kısmi istisna). */
export const KDV_ISTISNA_CODES: Record<string, string> = {
  '301': '11/1-a Mal ihracatı',
  '302': '11/1-a Hizmet ihracatı',
  '303': '11/1-a Roaming hizmetleri',
  '304': '13/a Deniz, hava ve demiryolu taşıma araçlarının teslimi',
  '305':
    '13/b Deniz ve hava taşıma araçları için liman ve hava meydanlarında yapılan hizmetler',
  '306': '13/c Petrol aramaları ve petrol boru hatlarının inşa ve modernizasyonu',
  '307': '13/c Maden arama ve işletme faaliyetleri',
  '308': '13/d Teşvikli yatırım mallarının teslimi',
  '309': '13/e Liman ve hava meydanlarının inşası, yenilenmesi ve genişletilmesi',
  '310': '13/f Ulusal güvenlik amaçlı teslim ve hizmetler',
  '311': '14/1 Uluslararası taşımacılık',
  '312': '15/a Diplomatik organ ve misyonlara yapılan teslim ve hizmetler',
  '313': '15/b Uluslararası kuruluşlara yapılan teslim ve hizmetler',
  '314': '19/2 Usulüne göre yürürlüğe girmiş uluslararası anlaşmalar',
  '315': '14/3 İhraç konusu eşyayı taşıyan araçlara motorin teslimleri',
  '316': '11/1-a Serbest bölgelerdeki müşteriler için fason hizmetler',
  '317': '17/4-s Engellilerin eğitim ve yaşam araç-gereçleri',
  '318': 'Geçici 29 Yap-işlet-devret modeli projeleri',
  '319': '13/g Başbakanlık merkez teşkilatına yapılan araç teslimleri',
  '320': 'Geçici 16 İSMEP kapsamında İstanbul Proje Koordinasyon Birimi',
  '321': 'Geçici 26 BM, NATO, OECD için yapılan mal ve hizmetler',
  '322': '11/1-a Bavul ticareti',
  '323': '13/ğ Ürün senetlerinin borsalar aracılığıyla ilk teslimi',
  '324': '13/h Türkiye Kızılay Derneğinin teslim ve hizmetleri',
  '325': '13/ı Yem teslimleri',
  '326': '13/ı Gıda, Tarım Bakanlığınca tescil edilmiş gübre teslimi',
  '327': '13/ı Gübre hammaddelerinin gübre üreticilerine teslimi',
  '328': '13/i Konut veya işyeri teslimleri',
  '330': '13/j Organize sanayi bölgeleri ve küçük sanayi sitelerinin inşası',
  '331': '13/m Ar-Ge faaliyetlerinde kullanılan yeni makina ve teçhizat',
  '332': 'Geçici 39 İmalat sanayiinde kullanılan yeni makina ve teçhizat',
  '333': '13/k Kamu idarelerine bağışlanan tesislerin inşası',
  '334': '13/l Yabancılara verilen sağlık hizmetleri',
  '335': '13/n Basılı kitap ve süreli yayınların teslimleri',
  '336': 'Geçici 40 UEFA müsabakaları kapsamında yapılan teslim ve hizmetler',
  '337': 'Türk Akım gaz boru hattı gaz taşıma hizmetleri',
  '338': 'İmalatçıların mal ihracatları',
  '339': 'Yatırım teşvik belgesi kapsamındaki inşaat işleri',
  '340': 'Elektrik motorlu taşıt geliştirilmesine yönelik mühendislik hizmetleri',
  '341': 'Afetzedelere bağışlanacak konutların inşası',
  '350': 'Diğerleri',
  '351': 'İstisna olmayan diğer',
  '201': '17/1 Kültür ve eğitim amacı taşıyan işlemler',
  '202': '17/2-a Sağlık, çevre ve sosyal yardım amaçlı işlemler',
  '204': '17/2-c Yabancı diplomatik organ ve hayır kurumlarının bağışları',
  '205': '17/2-d Taşınmaz kültür varlıklarına ilişkin teslimler',
  '206': '17/2-e Mesleki kuruluşların işlemleri',
  '207': '17/3 Askeri fabrika, tersane ve atölyelerin işlemleri',
  '208': '17/4-c Birleşme, devir, dönüşüm ve bölünme işlemleri',
  '209': '17/4-e Banka ve sigorta muameleleri vergisi kapsamına giren işlemler',
  '211': '17/4-h Zirai amaçlı su teslimleri',
  '212': '17/4-ı Serbest bölgelerde verilen hizmetler',
  '213': '17/4-j Boru hattı ile yapılan petrol ve gaz taşımacılığı',
  '214': '17/4-k Organize sanayi bölgelerindeki arsa ve işyeri teslimleri',
  '215': '17/4-l Varlık yönetim şirketlerinin işlemleri',
  '216': '17/4-m Tasarruf Mevduatı Sigorta Fonunun işlemleri',
  '217':
    '17/4-n Basın-Yayın ve Enformasyon Genel Müdürlüğüne verilen haber hizmetleri',
  '218': '17/4-o Gümrük antrepoları ve geçici depolama yerleri için kiralama',
  '219': '17/4-p Hazine ve Arsa Ofisi Genel Müdürlüğünün işlemleri',
  '220': '17/4-r İki tam yıl elde tutulan taşınmaz satışı',
  '221': 'Geçici 15 Konut yapı kooperatifleri için inşaat taahhüt hizmeti',
  '223': 'Geçici 20/1 Teknoloji geliştirme bölgelerinde yapılan işlemler',
  '225': 'Geçici 23 Milli Eğitim Bakanlığına yapılan bilgisayar bağışları',
  '226':
    '17/2-b Özel okullar, üniversite ve yüksekokullar tarafından verilen bedelsiz eğitim',
  '227':
    '17/2-b Kanunların gösterdiği gerek üzerine bedelsiz yapılan teslim ve hizmetler',
  '228': '17/2-b Kurum ve kuruluşlara bedelsiz olarak yapılan teslimler',
  '229':
    '17/2-b Gıda bankacılığı faaliyetinde bulunan dernek ve vakıflara bağışlanan gıda',
  '230': '17/4-g Külçe altın, gümüş ve kıymetli taşların teslimi',
  '231': '17/4-g Metal, plastik, lastik, kâğıt, cam hurda ve atıkların teslimi',
  '232': '17/4-g Döviz, para, damga pulu, değerli kâğıtlar teslimleri',
  '234': '17/4-ş Konut finansmanı amacıyla teminat gösterilen konutların teslimi',
  '235':
    '16/1-c Transit ve gümrük antrepo rejimleri kapsamındaki malların teslimi',
  '236':
    '19/2 Uluslararası anlaşmalar kapsamındaki istisnalar (iade hakkı tanınmayan)',
  '237': '17/4-t Ürün senetlerinin borsalar aracılığıyla sonraki teslimi',
  '238': '17/4-u Varlıkların varlık kiralama şirketlerine devri',
  '239': '17/4-y Taşınmazların finansal kiralama şirketlerine devri',
  '240':
    '17/4-z Patentli veya faydalı model belgeli buluşa ilişkin gayri maddi haklar',
  '241': 'TürkAkım gaz boru hattı projesine ilişkin hizmetler',
  '242':
    '17/4-ö Gümrük antrepoları için ardiye, depolama ve terminal hizmetleri',
  '250': 'Diğerleri',
}

/**
 * Bu istisna kodları ek yapılandırılmış veri veya farklı fatura profili
 * gerektirir; sohbet akışından güvenle kesilemez.
 */
export const UNSUPPORTED_ISTISNA_CODES: Record<string, string> = {
  '301':
    'Mal ihracatı faturası gümrük beyannamesi, GTİP ve İHRACAT e-Fatura profili gerektirir; bu fatura tipi henüz sohbetten kesilemiyor. Yurt dışına HİZMET faturası için 302 (Hizmet ihracatı) kullanılabilir.',
  '308':
    'Teşvikli yatırım malları faturası, yatırım teşvik belgesi bilgileri (belge no/tarihi) gerektirir; henüz sohbetten kesilemiyor.',
  '338':
    'İmalatçıların mal ihracatı, gümrük beyannamesi süreci gerektirir; henüz sohbetten kesilemiyor.',
}

export function resolveTevkifatCode(code: string | undefined): TevkifatCode | null {
  const trimmed = (code ?? '').trim()
  if (!trimmed) return null
  return TEVKIFAT_CODES[trimmed] ?? null
}

export function resolveIstisnaName(code: string | undefined): string | null {
  const trimmed = (code ?? '').trim()
  if (!trimmed) return null
  return KDV_ISTISNA_CODES[trimmed] ?? null
}

export function formatTevkifatRatio(t: TevkifatCode): string {
  return `${t.numerator}/${t.denominator}`
}

export interface InvoiceTaxLineInput {
  vatRate: number
  vatExemptionCode?: string
  withholdingCode?: string
}

/**
 * Fatura kalemlerinin vergi tutarlılığını doğrular; hata varsa Türkçe,
 * kullanıcıya aktarılabilir mesajla fırlatır.
 */
export function validateInvoiceTaxFields(items: InvoiceTaxLineInput[]): {
  hasWithholding: boolean
  allExempt: boolean
} {
  let withholdingCount = 0
  let exemptCount = 0

  for (const item of items) {
    const exemptionCode = item.vatExemptionCode?.trim()
    const withholdingCode = item.withholdingCode?.trim()

    if (!Number.isFinite(item.vatRate) || !isValidKdvRate(item.vatRate)) {
      throw new Error(
        `Geçersiz KDV oranı: ${item.vatRate}. Yürürlükteki oranlar %0, %1, %10 veya %20 olmalıdır (Temmuz 2023+).`,
      )
    }

    if (item.vatRate === 0) {
      if (!exemptionCode) {
        throw new Error(
          'KDV %0 olan satır için KDV istisna kodu zorunlu (ör. hizmet ihracatı → 302). Kullanıcıya istisna sebebini sor.',
        )
      }
    }

    if (exemptionCode) {
      const blocked = UNSUPPORTED_ISTISNA_CODES[exemptionCode]
      if (blocked) throw new Error(blocked)
      if (!resolveIstisnaName(exemptionCode)) {
        throw new Error(
          `Bilinmeyen KDV istisna kodu: ${exemptionCode}. Geçerli bir GİB istisna kodu gerekli (ör. 302 hizmet ihracatı, 350 diğerleri).`,
        )
      }
      if (item.vatRate !== 0) {
        throw new Error(
          'İstisna kodu verilen satırda KDV oranı 0 olmalı.',
        )
      }
      exemptCount++
    }

    if (withholdingCode) {
      const t = resolveTevkifatCode(withholdingCode)
      if (!t) {
        throw new Error(
          `Bilinmeyen tevkifat kodu: ${withholdingCode}. Geçerli kodlar 601–627 arasındadır; kullanıcıdan işleme uygun kodu netleştir.`,
        )
      }
      if (item.vatRate <= 0) {
        throw new Error(
          'Tevkifat yalnızca KDV hesaplanan satıra uygulanabilir; KDV %0 satırda tevkifat olmaz.',
        )
      }
      if (exemptionCode) {
        throw new Error(
          'Aynı satırda hem KDV istisnası hem tevkifat olamaz.',
        )
      }
      withholdingCount++
    }
  }

  if (withholdingCount > 0 && exemptCount > 0) {
    throw new Error(
      'Tevkifatlı ve KDV istisnalı kalemler aynı faturada birleştirilemiyor; ayrı faturalar halinde kesilmeli.',
    )
  }

  if (exemptCount > 0 && exemptCount !== items.length) {
    throw new Error(
      'KDV istisnalı ve KDV\'li kalemler aynı faturada karıştırılamıyor (GİB fatura tipi tek olmalı); ayrı faturalar halinde kesilmeli.',
    )
  }

  return {
    hasWithholding: withholdingCount > 0,
    allExempt: exemptCount > 0 && exemptCount === items.length,
  }
}
