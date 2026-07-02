# Mysoft EDocument API — Finla Entegrasyon Referansı

> Kaynak: Mysoft *Fatura Oluşturma Rehberi* (v1.0, 22.01.2026) + `EDocumentAPIPublic` Postman koleksiyonu (27.01.2026)  
> Postman dosyası: [`EDocumentAPIPublic.postman_collection.json`](./EDocumentAPIPublic.postman_collection.json)

---

## Ortamlar

| Ortam | API URL | Portal |
|-------|---------|--------|
| Test | `https://edocumentapi.mytest.tr` | `https://eportal.mytest.tr/?#!/login` |
| Canlı | `https://edocumentapi.mysoft.com.tr` | (Mysoft tarafından bildirilir) |

Finla yerel env: `supabase/.env` → `MYSOFT_API_URL`, `MYSOFT_USERNAME`, `MYSOFT_PASSWORD`, `MYSOFT_MOCK`

---

## Kimlik doğrulama (OAuth)

**Endpoint:** `POST /oauth/token`  
**Content-Type:** `application/x-www-form-urlencoded`

| Alan | Değer |
|------|-------|
| `grant_type` | `password` |
| `username` | İş ortağı API kullanıcısı (ör. Okşan'dan alınan e-posta) |
| `password` | API şifresi |

**Yanıt:** `access_token`, `token_type`, `expires_in`

Tüm API çağrılarında header:

```
Authorization: Bearer <access_token>
```

### Finla'da iki katman

| Katman | Kimlik | Nerede |
|--------|--------|--------|
| **A — İş ortağı API** | `MYSOFT_USERNAME` / `MYSOFT_PASSWORD` | `supabase/.env` (sunucu) |
| **B — Müşteri Finla** | Telefon + şifre (OTP sadece kayıtta) | `users` tablosu + JWT |
| **C — Fatura kapsamı** | `tenantIdentifierNumber` = müşteri VKN/TCKN | JWT `tenant_vkn` claim |

Portal ve API **aynı iş ortağı creds** ile giriş yapılır; müşteri şifresi Mysoft OAuth'a gitmez.

---

## Kullanıcı tipleri

### Firma kullanıcısı
Token alındığında sistem firma VKN'sini bilir → çoğu metotta `tenantIdentifierNumber` gerekmez.

### İş ortağı kullanıcısı (Finla modeli)
Tek API kullanıcısı ile birden fazla müşteri firmasının belgesi kesilir.  
**Her istekte** `tenantIdentifierNumber` = belge sahibi firmanın VKN/TCKN'si.

Finla'da müşteri onboarding'de VKN bağlar → JWT'de `tenant_vkn` → API'ye `tenantIdentifierNumber` olarak gider.

---

## Fatura oluşturma yöntemleri

### 1. Portal taslak (`invoiceDraftNew`)
- `POST /api/Invoice/invoiceDraftNew`
- Portal'da düzenlenebilir/silinebilir taslak
- Stok + cari kart beklenir
- İmzala: `GET /api/Invoice/invoiceDraftSignAndSend?invoiceETTN={ettn}`
- Sil: `DELETE` benzeri → `deleteInvoiceDraft`

### 2. Giden fatura — doğrudan GİB (`invoiceOutbox`) ← **Finla hedefi**
- `POST /api/InvoiceOutbox/invoiceOutbox`
- Portal'dan düzeltilemez
- Stok/cari zorunlu değil

### 3. Giden fatura — API taslağı
- Aynı endpoint, body'de **`isSaveAsDraft: true`**
- Portal'dan düzenlenemez; sadece API ile yönetilir
- Onay: `POST /api/InvoiceOutbox/sendDraftInvoiceToGIB`
- Sil: `GET/POST /api/InvoiceOutbox/deleteDraftInvoiceOutbox?invoiceETTN={ettn}`

**Finla akışı (Mysoft sandbox):** taslak oluştur → önizle → `sendDraftInvoiceToGIB` (kullanıcı SMS girmez; imza Mysoft sunucuda)

---

## Finla implementasyonu

```
supabase/functions/_shared/
├── mysoft-client.ts          # OAuth + HTTP
├── mysoft-mapper.ts          # Payload + liste parse
├── mysoft-zip.ts             # HTML/PDF zip çıkarma
└── invoice-provider/
    ├── mysoft-provider.ts    # Gerçek API
    └── mock-provider.ts      # MYSOFT_MOCK=true veya creds boş
```

| İşlem | Mysoft endpoint |
|-------|-----------------|
| Alıcı lookup (e-Fatura/e-Arşiv) | `GET /api/GeneralCard/getGibAccountModel?vknTckn=` |
| Taslak oluştur | `POST /api/InvoiceOutbox/invoiceOutbox` + `isSaveAsDraft: true` |
| GİB'e gönder | `POST /api/InvoiceOutbox/sendDraftInvoiceToGIB` |
| HTML önizleme | `GET /api/InvoiceOutbox/getInvoiceOutboxHTMLAsZip?invoiceETTN=` |
| PDF | `GET /api/InvoiceOutbox/getInvoiceOutboxPdfAsZip?invoiceETTN=` |
| Durum | `GET /api/InvoiceOutbox/getInvoiceOutboxStatus?invoiceETTN=` |
| Giden liste | `POST /api/InvoiceOutbox/getInvoiceOutboxWithHeaderInfoList` |
| Gelen liste | `POST /api/InvoiceInbox/getInvoiceInboxWithHeaderInfoListForPeriod` |
| Profil | `GET /api/GeneralCard/getUserInfo` / `getUserCompanyInfo` |

---

## `invoiceOutbox` minimum alanlar (SATIS)

Postman: `saveInvoiceOutboxWithMinimumFields`

```json
{
  "isSaveAsDraft": true,
  "isCalculateByApi": false,
  "id": 0,
  "eDocumentType": "EFATURA",
  "invoiceType": "SATIS",
  "profile": "TEMELFATURA",
  "docDate": "2026-01-26",
  "docTime": "2026-01-26 17:55",
  "currencyCode": "TRY",
  "currencyRate": "1",
  "tenantIdentifierNumber": "6271036106",
  "pkAlias": "urn:mail:adpk@ds.com",
  "senderType": "ELEKTRONIK",
  "invoiceAccount": {
    "vknTckn": "6271036106",
    "accountName": "ALICI UNVAN",
    "countryName": "TÜRKİYE",
    "cityName": "İSTANBUL",
    "citySubdivision": "ESENLER"
  },
  "invoiceDetail": [
    {
      "productName": "Ürün",
      "unitCode": "C62",
      "qty": "1",
      "unitPriceTra": "100",
      "amtTra": "100",
      "vatRate": "20",
      "amtVatTra": "20",
      "taxableAmtTra": 100
    }
  ]
}
```

### e-Fatura vs e-Arşiv

| Alıcı | `eDocumentType` | `profile` | Ek |
|-------|-----------------|-----------|-----|
| e-Fatura mükellefi | `EFATURA` | `TEMELFATURA` | `pkAlias` zorunlu |
| e-Arşiv | `EARSIVFATURA` | `EARSIVFATURA` | `pkAlias` yok |
| Yurt dışı alıcı | `EARSIVFATURA` | `EARSIVFATURA` | `vknTckn: "2222222222"`, ülke/şehir gerçek değer |

Routing: `getGibAccountModel` → yanıt şekli `{ data: { gibAccountName,
identifierNumber, eInvoiceStartDate, gibAccountAliasList: [{ alias, aliasType,
aliasDeleteDate }] } }`. **aliasType 1 = PK, 2 = GB**; silinmemiş `urn:` PK
seçilir (`pickPkAliasFromGibAccount`). GİB kaydı yoksa `data: null` döner →
e-Arşiv alıcısı. Kayıtlı alıcıya e-Arşiv body gönderilirse Mysoft
"E-Fatura için Profile alanında geçersiz değer" hatası verir (yanıltıcı mesaj —
asıl sorun belge tipi uyuşmazlığıdır).

### Fatura tipleri (`invoiceType`)

| Tip | Ne zaman | Finla durumu |
|-----|----------|--------------|
| `SATIS` | Normal satış | ✅ |
| `TEVKIFAT` | Kalemde `withholdingTaxTypeCode` (601–627) varsa; oran KDV üzerinden, `payableAmount = brüt − tevkifat`. **e-Fatura'da profil `TICARIFATURA` zorunlu** (alıcının red hakkı; `TEMELFATURA`/`EARSIVFATURA` profili "geçersiz Profile" hatası verir — sandbox doğrulandı) | ✅ (`gib-tax-codes.ts`) |
| `ISTISNA` | Tüm kalemler KDV %0 + `taxExemptionReasonCode` (ör. 302 hizmet ihracatı) | ✅ (`gib-tax-codes.ts`) |
| `ISTISNA` + `profile: IHRACAT` | Mal ihracatı (GTİP, gümrük, `pkAlias: ihracatpk@gtb.gov.tr`) | ❌ desteklenmiyor — chat kullanıcıyı yönlendirir |
| `IADE` | İade faturası (`billingRefInvoiceNo` referansı) | ❌ |
| `YTBISTISNA` vb. | Yatırım teşvik (belge no/tarih, `expenditureType`) | ❌ |

Tevkifat örneği (Postman `saveInvoiceOutboxTEVKIFAT`): satır bazında
`withholdingTaxTypeCode/Name/Percentage`, `withholdingTaxableAmount` = satır KDV'si,
`withholdingTaxAmount` = KDV × oran. Kod/oran tablosu: `_shared/gib-tax-codes.ts`
(KDVGUT kısmi tevkifat listesi; 2026 alt sınır 12.000 TL KDV dahil).

İstisna kodları: 3xx tam / 2xx kısmi istisna listesi de `gib-tax-codes.ts` içinde.
KDV %0 satır istisna kodu olmadan reddedilir (GİB şematron hatasını önler).

### Taslak silme

`GET /api/InvoiceOutbox/deleteDraftInvoiceOutbox?invoiceETTN={ettn}` — chat'te
`replace_existing_draft` ve taslak iptali bu endpoint'i kullanır (best-effort;
taslak GİB'e gitmediği için silinmese de yenisi oluşturulabilir).

Test VKN (Postman): `6271036106` — MYSOFT DİJİTAL DÖNÜŞÜM A.Ş. TEST  
e-Arşiv örnek TCKN: `11111111111`

### Entegre edilmemiş alanlar (yol haritası)

- **İskonto**: satır `discRate`/`discAmtTra`, toplamda `allowanceTotalAmount` — şu an hep 0
- **İade faturası** (`invoiceType: IADE` + `billingRefInvoiceNo/Date`)
- **Mal ihracatı** (`profile: IHRACAT`: GTİP, `deliveryTermCode` incoterms, `transportModeCode`, `shipment`)
- **Özel matrah** (8xx kodları), **ÖTV/ÖİV/konaklama vergisi** (farklı `taxTypeCode`)
- **KAMU faturası** (`publicServicePayee*` alanları), **SGK**, **yatırım teşvik** senaryoları
- **Ödeme bilgisi** (`paymentMeans`, vade `dueDate`), **not satırları** (`notes`)
- **Tam tevkifat** (kısmi 601–627 dışındaki 10/10 uygulamaları)
- **e-İrsaliye / SMM** (Despatch*, Receipt* modülleri)

---

## Liste sorgusu

**Giden:** `POST /api/InvoiceOutbox/getInvoiceOutboxWithHeaderInfoList`

```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "eDocumentType": null,
  "afterValue": 0,
  "limit": 0,
  "tenantIdentifierNumber": "6271036106"
}
```

> Postman örneğinde `limit: 0` = sınırsız/varsayılan. Finla da aynısını kullanır.

> **Tek gün sorgusu:** `startDate === endDate` gönderildiğinde API boş dönebilir. Finla bitiş tarihini API'ye +1 gün genişletir, sonucu `docDate` ile süzer.

**Gelen:** `POST /api/InvoiceInbox/getInvoiceInboxWithHeaderInfoListForPeriod` — `mysoftInboxListDateTimes()`: çok gün `bitiş 23:59:59`, tek gün `queryEnd 00:00:00` (+1 gün)

Finla UI tarihleri `GG/AA/YYYY` gönderir → backend `YYYY-MM-DD`'ye çevirir.

---

## ETTN (kritik)

Her fatura oluşturma yanıtında **ETTN** döner. Sonraki tüm işlemler (önizleme, gönder, liste, iptal) ETTN ile yapılır.

Finla: ETTN → `draft.uuid` / `invoice_uuid` / chat'te ETTN olarak saklanır.

---

## Durum takibi

`success: true` ≠ uçtan uca başarı.

Akış: API → Mysoft imza → GİB → alıcı entegratör → sistem yanıtı → Mysoft

Periyodik poll: `GET /api/InvoiceOutbox/getInvoiceOutboxStatusChanged`

---

## Yerel test komutları

```bash
# 1. Stack
npm run supabase:start
npm run supabase:functions    # ayrı terminal — AUTH_* + MYSOFT_* burada yüklenir

# 2. OAuth + liste smoke (tenant VKN parametreli)
curl -s "http://127.0.0.1:54321/functions/v1/mysoft-smoke?tenant=6271036106&start=2026-01-01&end=2026-12-31" | python3 -m json.tool
```

Beklenen: `list_probe.row_count > 0` (portal ile aynı tenant VKN ise)

---

## Sorun giderme: Portal'da var, Finla'da boş liste

1. **Tenant VKN uyuşmuyor** — Finla'da bağladığın VKN, portalda seçili firma ile aynı mı? (JWT `tenant_vkn`)
2. **Tarih aralığı** — UI filtresi (Bu Ay / Bu Yıl) fatura tarihini kapsıyor mu?
3. **Liste parse** — `extractMysoftListRows` iç içe `data` anahtarlarını çözer; smoke'ta `payload_keys` ve `sample_row` kontrol et
4. **Mock mod** — `MYSOFT_MOCK=false` ve creds dolu olmalı
5. **Functions env** — `npm run supabase:functions` çalışıyor olmalı (`--env-file supabase/.env`)

Portalda hangi firmayı görüyorsan, Finla kayıt sonrası **aynı VKN'yi** `link-tenant` adımında bağla.

**Örnek (sandbox):** Portal faturaları `6271036106` altında; kişisel TCKN (`10127876686`) iş ortağı hesabında tanımlı değil → API `firma kaydı bulunamadı` döner.

`link-tenant` artık Mysoft'ta tenant varlığını doğrular (`assertMysoftTenantExists`). Yanlış VKN ile bağlanma engellenir.

Yanlış VKN bağlandıysa: çıkış yap → tekrar giriş → profil veya `link-tenant` API ile doğru VKN'yi bağla (`6271036106`).

---

## Postman koleksiyonu — ana modüller

| Modül | Açıklama |
|-------|----------|
| `InvoiceOutbox` | Giden fatura (oluştur, liste, PDF/HTML, iptal) |
| `InvoiceInbox` | Gelen fatura |
| `InvoiceDraft` | Portal taslağı (`invoiceDraftNew`) |
| `DespatchOutbox` / `DespatchInbox` | İrsaliye |
| `ReceiptOutbox` / `ReceiptInbox` | Serbest meslek makbuzu |
| `GeneralCard` | `getGibAccountModel`, `getUserInfo`, `getUserCompanyInfo` |
| `token` | OAuth |

---

## İletişim (Mysoft mailinden)

| Konu | Kişi | E-posta |
|------|------|---------|
| Test API kullanıcı/şifre | Okşan Ergün | oksan.ergun@mysoft.com.tr |
| Teknik entegrasyon | Uğur Yılmaz | ugur.yilmaz@mysoft.com.tr |

---

## Finla dosya haritası

| Dosya | Rol |
|-------|-----|
| `supabase/.env` | `MYSOFT_*`, `AUTH_*` (commit edilmez) |
| `.env.local` | `EXPO_PUBLIC_*` |
| `supabase/functions/auth/` | Telefon OTP + şifre |
| `supabase/functions/invoices/` | Liste API |
| `supabase/functions/mysoft-smoke/` | Bağlantı + liste debug |
| `docs/mysoft/MYSOFT_API.md` | Bu dosya |

---

*Son güncelleme: 2026-07-01 — Finla Mysoft geçişi Faz 2*
