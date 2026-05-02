# Yeni Migration

Yeni bir Supabase migration'a ihtiyacım var: $ARGUMENTS

- `supabase/migrations/` içindeki mevcut migration'lara bak, numaralandırmayı devam ettir
- `gib_sessions` veya `gib_credentials_vault`'a dokunuyorsa vault fonksiyonları üzerinden yap
- Migration'ları retroaktif düzenleme — her zaman yeni dosya ekle
- Hazırladıktan sonra `npx supabase db reset` ile test et
