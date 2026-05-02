# CLAUDE.md

## Stack
- **Mobile:** React Native 0.81 + Expo 54 + expo-router (file-based routing)
- **Backend:** Supabase Edge Functions (Deno runtime)
- **AI:** Claude API — `chat` Edge Function üzerinden
- **DB:** Supabase PostgreSQL (6 migration, local dev: `supabase start`)
- **E-Fatura:** GİB (Türk e-fatura sistemi) — `fatura` kütüphanesi (`fatura-mcp/fatura/`)
- **Auth:** Custom JWT — GİB credentials → Supabase vault → access/refresh token (expo-secure-store)
- **MCP:** `fatura-mcp` — fatura kütüphanesine Claude erişimi sağlar

## Komutlar
```bash
npm start              # Expo geliştirme sunucusu
npm run ios            # iOS simulator
npm run ios:clean      # Cache temizleyerek iOS
npm run android        # Android emulator
npm run lint           # ESLint

npx supabase start                    # Yerel Supabase (gerekli: DB + Edge Functions)
npx supabase functions serve          # Edge Functions'ı yerel çalıştır
npx supabase db reset                 # Tüm migration'ları sıfırdan uygula
npx supabase migration new <isim>     # Yeni migration oluştur

cd fatura-mcp && npm run build        # MCP sunucusunu derle
```

## Mimari
```
finla/
├── app/                    # Expo Router ekranları (file-based routing)
│   ├── index.tsx           # Ana chat ekranı — AI + action system
│   ├── invoices.tsx        # Fatura listesi
│   ├── login.tsx           # GİB kullanıcı girişi
│   └── (tabs)/             # Alt sekme navigasyonu
├── components/             # Paylaşılan UI bileşenleri
├── lib/
│   ├── api.ts              # Edge Function çağrıları + token yenileme (mutex ile)
│   ├── session.ts          # expo-secure-store token okuma/yazma
│   └── supabase.ts         # Supabase client
├── supabase/
│   ├── functions/
│   │   ├── _shared/        # cors, crypto, gib client, session-auth, tools (Claude araç tanımları)
│   │   ├── chat/           # Claude AI orchestrator + action routing
│   │   ├── invoices/       # Fatura sorgulama + invoice_facts upsert
│   │   ├── login/          # GİB oturum → custom JWT üretimi
│   │   ├── logout/         # Token geçersizleştirme
│   │   ├── invoice-detail/ # Tekil fatura detayı
│   │   └── refresh/        # Access token yenileme
│   └── migrations/         # 001-initial → 006-gib_credentials_vault
└── fatura-mcp/             # MCP sunucusu: fatura kaynak koduna Claude erişimi
    └── fatura/             # GİB API istemci kütüphanesi (doğrudan değiştirilmez)
```

## Kritik dosyalar
| Dosya | Ne işe yarar |
|---|---|
| `lib/api.ts` | Tüm API çağrıları, 401'de token yenileme (tek mutex ile yarış önlemi) |
| `lib/session.ts` | expo-secure-store token saklama/okuma |
| `supabase/functions/_shared/gib.ts` | GİB API istemcisi — `faturaListInvoices`, `mapInvoicesToFacts` |
| `supabase/functions/_shared/session-auth.ts` | Edge Function JWT doğrulama middleware |
| `supabase/functions/_shared/tools.ts` | Claude tool tanımları (chat action şemaları burada) |
| `supabase/functions/chat/index.ts` | Claude AI orchestrator + action routing |
| `supabase/migrations/006_gib_credentials_vault.sql` | GİB şifrelerinin vault şeması |
| `app/index.tsx` | Chat ekranı + action modalları (open_invoices, sign_otp, preview...) |

## Dikkat edilecekler
- **İki ayrı token:** Supabase gateway `Authorization: Bearer <anon_key>` bekler, gerçek kullanıcı tokenı `x-finla-access-token` header'ında gider. Karıştırılmamalı.
- **GİB oturumları kısa ömürlü:** `gib_sessions` tablosunda şifreli tutuluyor. Her Edge Function çağrısında yenilenmeli.
- **invoice_facts upsert:** GİB'den gelen ham fatura verisi `invoice_facts` tablosuna yazılır, filtreleme oradan yapılır.
- **callEdgeFunction deprecated:** `lib/api.ts`'te `callApi` kullan. Eski export geriye dönük uyumluluk için var — ama `app/index.tsx`'te hâlâ kullanılıyor, taşınmalı.
- **Supabase local:** `supabase start` çalışmadan Edge Functions test edilemez. `edge_runtime policy = "oneshot"` — her istek yeni worker başlatır.
- **enable_signup = false:** Supabase auth kapalı, auth tamamen custom GİB tabanlı.

## Yasaklı / riskli işlemler
- `.env.local` dosyasını commit etme (gerçek Supabase URL + key içeriyor)
- `gib_credentials_vault` tablosunu ham SQL ile güncelleme — vault fonksiyonları üzerinden yap
- GİB credentials veya GİB tokenlarını `console.log` / hata mesajına dahil etme
- `supabase/migrations/` dosyalarını retroaktif düzenleme — her zaman yeni migration ekle
- `fatura-mcp/fatura/` kütüphanesini doğrudan değiştirme (harici bağımlılık gibi davranılmalı)
- Production'a `supabase functions deploy` yapmadan önce yerel test et
