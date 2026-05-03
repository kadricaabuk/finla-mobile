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
├── app/
│   ├── _layout.tsx                # Kök Stack: login + (main)
│   ├── login.tsx                  # GİB kullanıcı girişi
│   └── (main)/
│       ├── _layout.tsx            # MainAppShellProvider + Stack; ortak SideMenu
│       ├── index.tsx               # → chat-screen (/, sohbet)
│       └── invoices.tsx            # → invoices-screen (/invoices)
├── contexts/
│   └── main-app-shell-context.tsx # Oturum yükleme, konuşmalar listesi, menü bağlama API’si
├── components/
│   ├── chat/                      # chat-screen, use-chat-screen, balon/modallar
│   ├── invoices/                # invoices-screen, use-invoices-screen, liste/filtre
│   ├── layout/                    # icon-header-button, session-bootstrap-placeholder
│   ├── chat-input.tsx
│   └── side-menu.tsx
├── hooks/                         # use-finla-session, use-conversations-list, use-logout,
│                                  # use-keyboard, use-scroll-to-end-on-keyboard,
│                                  # use-register-main-shell-side-menu
├── types/                         # chat-actions.ts, gib-invoice.ts
├── constants/                     # chat-markdown-styles.ts
├── lib/
│   ├── api.ts                     # Edge Function çağrıları + token yenileme (mutex ile)
│   ├── supabase.ts                # callApi/login/logout — @/lib/api re-export
│   ├── session.ts                 # expo-secure-store token okuma/yazma
│   ├── invoices-cache.ts          # Fatura listesi offline/TTL cache
│   ├── inject-html-viewport.ts, markdown-table.ts, pretty-invoice-status.ts
│   └── invoice-date-presets.ts, format-gib-invoice.ts
├── supabase/
│   ├── functions/
│   │   ├── _shared/               # cors, crypto, gib client, session-auth, tools
│   │   ├── chat/                  # Claude AI orchestrator + action routing
│   │   ├── conversations/         # Sohbet listesi + mesaj yükleme
│   │   ├── invoices/              # Fatura sorgulama + invoice_facts upsert
│   │   ├── excel-export/          # Fatura listesi → .xlsx + Storage signed URL
│   │   ├── login/                 # GİB oturum → custom JWT üretimi
│   │   ├── logout/                # Token geçersizleştirme
│   │   ├── invoice-detail/        # Tekil fatura detayı
│   │   └── refresh/               # Access token yenileme
│   └── migrations/                # 001-initial → 006-gib_credentials_vault
└── fatura-mcp/
    └── fatura/                    # GİB API istemci kütüphanesi (doğrudan değiştirilmez)
```

## Kritik dosyalar
| Dosya | Ne işe yarar |
|---|---|
| `lib/api.ts` | Tüm API çağrıları, 401'de token yenileme (tek mutex ile yarış önlemi) |
| `lib/supabase.ts` | UI tarafından `callApi` / `loginRequest` / `logoutRequest` import re-export |
| `lib/session.ts` | expo-secure-store token saklama/okuma |
| `hooks/use-finla-session.ts` | Oturum etiketi + bootstrap; login’e yönlendirme |
| `hooks/use-conversations-list.ts` | `conversations` Edge Function ile yan menü listesi |
| `hooks/use-logout.ts` | Sunucu logout + cache/temizlik + `/login` |
| `contexts/main-app-shell-context.tsx` | `(main)` layout: oturum + SideMenu tek yerde; ekranlar `useRegisterMainShellSideMenu` ile handler bağlar |
| `app/(main)/_layout.tsx` | `MainAppShellProvider` içinde iç Stack (`index`, `invoices`) |
| `components/chat/chat-screen.tsx` | Sohbet UI; iş mantığı `use-chat-screen.ts` |
| `components/invoices/invoices-screen.tsx` | Fatura listesi UI; iş mantığı `use-invoices-screen.ts` |
| `lib/invoices-cache.ts` | Fatura listesi cache (access token’a bağlı) |
| `supabase/functions/_shared/gib.ts` | GİB API istemcisi — `faturaListInvoices`, `mapInvoicesToFacts` |
| `supabase/functions/_shared/session-auth.ts` | Edge Function JWT doğrulama middleware |
| `supabase/functions/_shared/tools.ts` | Claude tool tanımları (chat action şemaları burada) |
| `supabase/functions/chat/index.ts` | Claude AI orchestrator + action routing |
| `supabase/migrations/006_gib_credentials_vault.sql` | GİB şifrelerinin vault şeması |

## Dikkat edilecekler
- **İki ayrı token:** Supabase gateway `Authorization: Bearer <anon_key>` bekler, gerçek kullanıcı tokenı `x-finla-access-token` header'ında gider. Karıştırılmamalı.
- **GİB oturumları kısa ömürlü:** `gib_sessions` tablosunda şifreli tutuluyor. Her Edge Function çağrısında yenilenmeli.
- **invoice_facts upsert:** GİB'den gelen ham fatura verisi `invoice_facts` tablosuna yazılır, filtreleme oradan yapılır.
- **API import:** UI’da `callApi` genelde `@/lib/supabase` üzerinden gelir (`lib/api.ts`’in re-export’u). `callEdgeFunction` deprecated — doğrudan `callApi` kullan.
- **Supabase local:** `supabase start` çalışmadan Edge Functions test edilemez. `edge_runtime policy = "oneshot"` — her istek yeni worker başlatır.
- **enable_signup = false:** Supabase auth kapalı, auth tamamen custom GİB tabanlı.

## Yasaklı / riskli işlemler
- `.env.local` dosyasını commit etme (gerçek Supabase URL + key içeriyor)
- `gib_credentials_vault` tablosunu ham SQL ile güncelleme — vault fonksiyonları üzerinden yap
- GİB credentials veya GİB tokenlarını `console.log` / hata mesajına dahil etme
- `supabase/migrations/` dosyalarını retroaktif düzenleme — her zaman yeni migration ekle
- `fatura-mcp/fatura/` kütüphanesini doğrudan değiştirme (harici bağımlılık gibi davranılmalı)
- Production'a `supabase functions deploy` yapmadan önce yerel test et
