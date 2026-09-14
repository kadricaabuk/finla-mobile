# Finla Edge Function API

Client ↔ Supabase Edge Function kontratı. Mysoft e-doküman API’si için ayrı referans:
[`docs/mysoft/MYSOFT_API.md`](../mysoft/MYSOFT_API.md).

Kaynak: `supabase/functions/*/index.ts` + mobil istemci `lib/api.ts`.

---

## Ortam

| Ortam | Base URL |
|-------|----------|
| Yerel | `http://<LAN-IP>:54321/functions/v1` (`EXPO_PUBLIC_API_BASE_URL`) |
| Hosted | `https://<project-ref>.supabase.co/functions/v1` |

Tüm uçlar **POST** (CORS preflight `OPTIONS` hariç). Content-Type: `application/json`.

---

## Kimlik doğrulama (iki katman)

Supabase gateway ve Finla oturumu **farklı** token’lar kullanır. Karıştırılmamalı.

| Header | Değer | Kim |
|--------|-------|-----|
| `Authorization` | `Bearer <EXPO_PUBLIC_SUPABASE_ANON_KEY>` | Supabase gateway |
| `apikey` | aynı anon key | Supabase gateway |
| `x-finla-access-token` | Finla access JWT | Uygulama oturumu |

- **Public** uçlar (`auth` login/OTP, `refresh`): anon key yeter; `x-finla-access-token` yok.
- **Korumalı** uçlar: `requireFinlaSession` → `x-finla-access-token` zorunlu.
- Access token TTL ≈ **15 dk**; refresh ≈ **14 gün**. 401’de istemci `refresh` çağırır ve bir kez yeniden dener (`lib/api.ts`).

Hata gövdesi genelde `{ "error": "<mesaj>" }` veya auth’ta `{ "success": false, "error": "…" }` (+ isteğe bağlı `error_code`).

---

## Uçlar

### `auth` — telefon + OTP / PIN

Public (link-tenant hariç). Body’de `action` zorunlu.

| action | Body | Başarı yanıtı |
|--------|------|----------------|
| `request-otp` | `{ phone }` | `{ success, message, debug_code? }` |
| `verify-otp` | `{ phone, code }` | `{ success, message }` |
| `set-password` | `{ phone, password }` | `{ success, accessToken, refreshToken, expiresIn, onboarding_status }` |
| `login` | `{ phone, password }` | aynı + `tenant_vkn?` |
| `link-tenant` | `{ vkn_tckn, display_name? }` + session | tokens + `tenant_vkn`, `tenant_name`, `onboarding_status` |

Önemli hatalar:

- `PHONE_EXISTS` — kayıtlı telefon, girişe yönlendir.
- 400 bilinmeyen `action`.
- `link-tenant` oturumsuz → 401.

---

### `refresh` — access token yenileme

Public.

```json
// request
{ "refreshToken": "<string>" }

// success
{ "success": true, "accessToken": "…", "refreshToken": "…", "expiresIn": 900 }

// failure
{ "success": false, "error": "…" }
```

---

### `logout` — oturum iptali

Korumalı. Body: `{}`. Yanıt: `{ "success": true }`. Subject’in tüm refresh oturumlarını revoke eder.

---

### `profile` — kullanıcı / GİB profili

Korumalı.

| İstek | Davranış |
|-------|----------|
| `{}` veya updates yok | `{ profile: UserProfile }` oku |
| `{ updates: Partial<UserProfile> }` | yalnızca gönderilen alanları güncelle → `{ profile }` |

`UserProfile` alanları (mobil tip): `taxIDOrTRID`, `title`, `name`, `surname`, isteğe bağlı adres/iletişim alanları (`phoneNumber`, `email`, `webSite`, …).

---

### `conversations` — sohbet listesi / mesajlar

Korumalı. `action`: `list` | `messages`.

| action | Body | Yanıt |
|--------|------|-------|
| `list` | `{}` | `{ conversations: [{ id, title, created_at }] }` (max 80) |
| `messages` | `{ conversationId }` | `{ messages: [{ id, role, content, created_at, action_snapshot }] }` |

Geçersiz / yabancı `conversationId` → 400 / 404.

---

### `chat` — Claude orchestrator

Korumalı. Body:

```ts
{
  message?: string
  conversationId?: string | null
  action?: { type?: string; draftUuid?: string }  // örn. confirm_pending_invoice
  stream?: boolean
}
```

`message` veya `action` en az biri zorunlu. `conversationId` yoksa yeni sohbet açılır.

JSON yanıt (stream kapalı):

```ts
{ message: string, conversationId: string, action: ChatMessageAction | null }
```

`Accept: application/x-ndjson, application/json;q=0.9` ile NDJSON stream desteklenir (mobil `streamChat`). Action şemaları: `supabase/functions/_shared/tools.ts`, mobil tipler: `types/chat-actions.ts`.

---

### `invoices` — fatura listesi + `invoice_facts` sync

Korumalı.

```ts
// request
{
  startDate: string   // zorunlu
  endDate: string     // zorunlu
  direction?: "outgoing" | "incoming"  // default outgoing
  customerName?: string
  amountGte?: number
  amountEq?: number
}

// response
{ invoices: GibInvoice[], synced: number }
```

Sağlayıcıdan (Mysoft) çeker, GİB-şekilli forma map’ler, `invoice_facts` upsert, sonra filtreler.

---

### `invoice-detail` — tekil fatura

Korumalı. `{ invoiceUuid, direction?: "outgoing"|"incoming" }` → `{ invoice }` (`invoice_uuid`, tutarlar, status, müşteri alanları, …). Yoksa 404.

---

### `invoice-html` — HTML önizleme

Korumalı.

```ts
{
  invoiceUuid: string          // zorunlu
  signed?: boolean
  draftDate?: string
  conversationId?: string      // local fallback (outgoing draft)
  direction?: "outgoing" | "incoming"
}
```

Yanıt: sağlayıcı preview (`html`, …) veya `{ html, local_fallback: true }`.

---

### `invoice-inbox-action` — gelen kutu kabul/red

Korumalı. Mock modda 400.

```ts
// request
{ invoiceUuid: string, action: "accept" | "reject", rejectReason?: string }

// response
{ ok: true, status: "accepted"|"rejected", status_label: string }
```

`invoice_facts` incoming satırının status’unu günceller.

---

### `excel-export` — giden fatura .xlsx

Korumalı. Tarihler **GG/AA/YYYY**.

```ts
// request
{ startDate, endDate, customerName?, amountGte?, amountEq? }

// response
{
  download_url: string
  file_name: string
  row_count: number
  expires_in_seconds: number
}
```

Storage signed URL. Yalnızca **outgoing** export (Edge Function sabit).

---

### `mysoft-smoke` — entegrasyon smoke

Geliştirme/ops. Query: `?tenant=&start=&end=`. Mock’ta `{ ok: false, mode: "mock", message }`. Canlıda Mysoft token + örnek list/inbox çağrıları.

---

## HTTP durum özeti

| Kod | Anlam |
|-----|--------|
| 200 | Başarı (bazı auth hataları da 200 + `success: false`) |
| 400 | Eksik/geçersiz parametre, bilinmeyen action |
| 401 / 403 | Oturum yok veya geçersiz |
| 404 | Kaynak yok (sohbet, fatura) |
| 405 | Method Not Allowed |
| 500 | Beklenmeyen sunucu hatası |

---

## İstemci notları

- Mobil çağrılar: `lib/api.ts` → `callApi` / `streamChat` / `auth*` / `loginRequest`.
- Feature flag, pending invoice ve chat action detayları kodda; bu dosya **HTTP kontratı** odaklıdır.
- Sağlayıcı değişince (Mysoft) istemci kontratı aynı kalmalı; mapping `invoice-mapper` / `invoice-provider` altında.
