# Edge Function Geliştirme

Bir Supabase Edge Function üzerinde çalışıyorum: $ARGUMENTS

- `supabase/functions/_shared/` içindeki yardımcı araçları kullan (cors, session-auth, mysoft-client, invoice-provider, tools)
- CORS, hata formatı ve session doğrulamasını mevcut fonksiyonlarla tutarlı tut
- Deno runtime: npm paketleri için `npm:` prefix, Deno paketleri için `deno.land/x`
- Auth: `getSubjectFromAuthHeader(req)` — username döner, `SessionAuthError` fırlatır
- Değişiklikleri `npx supabase functions serve` ile yerel test et
