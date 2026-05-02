# Yeni Chat Action Ekleme

Chat sistemine yeni bir action eklemek istiyorum: $ARGUMENTS

Mevcut action türleri: `open_invoices` | `open_invoice_detail` | `open_invoice_preview` | `open_sign_otp`

Adımlar:
1. `supabase/functions/_shared/tools.ts` — Claude araç tanımı ekle
2. `supabase/functions/chat/index.ts` — action routing mantığı yaz
3. `app/index.tsx` — `Message.action` tipini ve UI handler'ı güncelle
