# CLAUDE.md

## Stack
- **Mobile:** React Native 0.81 + Expo 54 + expo-router (file-based routing)
- **Backend:** Supabase Edge Functions (Deno runtime)
- **AI:** Claude API — `chat` Edge Function üzerinden
- **DB:** Supabase PostgreSQL (13 migration, local dev: `supabase start`)
- **E-Fatura:** Mysoft e-doküman API (`_shared/mysoft-client.ts`) — GİB'e Mysoft üzerinden bağlanılıyor, GİB-şekilli veri sözleşmesi (`types/gib-invoice.ts`) korunuyor
- **Auth:** Custom JWT — telefon + OTP (`_shared/otp-service.ts`, `_shared/user-service.ts`) → access/refresh token (expo-secure-store)

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
```

## Mimari
```
finla/
├── app/
│   ├── _layout.tsx                # Kök Stack: login + (main)
│   ├── login.tsx                  # Telefon + OTP girişi
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
├── types/                         # chat-actions.ts, gib-invoice.ts (GİB-şekilli ortak fatura tipi)
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
│   │   ├── _shared/               # cors, crypto, session-auth, mysoft-client, invoice-provider, tools
│   │   ├── auth/                  # Telefon+OTP login/register/link-tenant → custom JWT
│   │   ├── chat/                  # Claude AI orchestrator + action routing
│   │   ├── conversations/         # Sohbet listesi + mesaj yükleme
│   │   ├── invoices/              # Fatura sorgulama + invoice_facts upsert (Mysoft üzerinden)
│   │   ├── invoice-detail/        # Tekil fatura detayı
│   │   ├── invoice-html/          # Fatura HTML önizleme
│   │   ├── invoice-inbox-action/  # Gelen kutusu aksiyonları (kabul/red vb.)
│   │   ├── excel-export/          # Fatura listesi → .xlsx + Storage signed URL
│   │   ├── features/              # Feature flag sorgulama
│   │   ├── profile/                # Kullanıcı profili
│   │   ├── logout/                # Token geçersizleştirme
│   │   ├── refresh/               # Access token yenileme
│   │   └── mysoft-smoke/          # Mysoft entegrasyonu smoke testi
│   └── migrations/                # 001_initial → 012_conversation_chat_context + RLS migration'ı
└── docs/                          # mysoft/ altında Mysoft API referansları
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
| `supabase/functions/_shared/mysoft-client.ts` | Mysoft e-doküman API istemcisi |
| `supabase/functions/_shared/invoice-provider/mysoft-provider.ts` | Fatura sağlayıcı arayüzünün Mysoft implementasyonu |
| `supabase/functions/_shared/invoice-mapper.ts` | `mapInvoicesToFacts` — sağlayıcıdan bağımsız fatura → `invoice_facts` dönüşümü |
| `supabase/functions/_shared/session-auth.ts` | Edge Function JWT doğrulama middleware |
| `supabase/functions/_shared/tools.ts` | Claude tool tanımları (chat action şemaları burada) |
| `supabase/functions/chat/index.ts` | Claude AI orchestrator + action routing |
| `supabase/functions/auth/index.ts` | Telefon+OTP login/register/link-tenant akışı |

## Dikkat edilecekler
- **İki ayrı token:** Supabase gateway `Authorization: Bearer <anon_key>` bekler, gerçek kullanıcı tokenı `x-finla-access-token` header'ında gider. Karıştırılmamalı.
- **invoice_facts upsert:** Mysoft'tan gelen ham fatura verisi GİB-şekilli forma dönüştürülüp `invoice_facts` tablosuna yazılır, filtreleme oradan yapılır.
- **API import:** UI’da `callApi` genelde `@/lib/supabase` üzerinden gelir (`lib/api.ts`’in re-export’u). `callEdgeFunction` deprecated — doğrudan `callApi` kullan.
- **Supabase local:** `supabase start` çalışmadan Edge Functions test edilemez. `edge_runtime policy = "oneshot"` — her istek yeni worker başlatır.
- **enable_signup = false:** Supabase auth kapalı, auth tamamen custom telefon+OTP tabanlı.

## Yasaklı / riskli işlemler
- `.env.local` dosyasını commit etme (gerçek Supabase URL + key içeriyor)
- Mysoft credentials veya token değerlerini `console.log` / hata mesajına dahil etme
- `supabase/migrations/` dosyalarını retroaktif düzenleme — her zaman yeni migration ekle
- Production'a `supabase functions deploy` yapmadan önce yerel test et
