# GİB API Debug

GİB API sorunu: $ARGUMENTS

- `supabase/functions/_shared/gib.ts` ve `gib-errors.ts`'e bak
- fatura-mcp araçlarıyla (`read_file`, `search_source`) fatura kütüphanesi kaynaklarını incele
- `gib_sessions` tablosundaki oturum geçerliliğini kontrol et (oturumlar kısa ömürlü)
- GİB hata kodlarını `gib-errors.ts`'teki tanımlarla eşleştir
- Credentials veya token değerlerini asla loglama
