# Muhasebeci — Haftalık Uyumluluk Denetimi

**Tarih:** 2026-08-31
**Kapsam:** Statik kod/akış incelemesi (repo: `finla`, commit ağacı üzerinden okuma). Uygulama simülatörde çalıştırılmadı.

**Ortam notu:** Bu çalıştırmada `/areas/finla-team.md`, `/areas/finla.md`, `/areas/finla-compliance-review.md` hafıza dosyalarına ve push-notification aracına erişim yoktu (bu Cowork oturumunda bağlı değiller); bu yüzden önceki tarama bulguları okunamadı ve sonuç push olarak gönderilemedi — bu dosya doğrudan proje deposuna yazıldı. Repoya erişim ise bağlı klasör üzerinden sorunsuz sağlandı.

---

## KRİTİK (yasal risk)

Bu taramada "faturalar geçersiz/eksik" seviyesinde acil bir bulgu **yok**. Aşağıdaki döviz kuru bulgusu ciddiye alınmalı ama e-belgeyi geçersiz kılan türden değil (bkz. Geliştirilmeli #1).

## GELİŞTİRİLMELİ

**1. Dövizli faturalarda TCMB SATIŞ kuru kullanılıyor, ALIŞ kuru kullanılmalı (teyit edilmeli)**
`supabase/functions/_shared/exchange-rate.ts` TCMB'nin `ForexSelling` (döviz satış) alanını okuyup `rateType: 'forex_selling'` olarak döndürüyor; bu kur doğrudan `create_invoice`'a `exchange_rate` olarak geçiyor ve GİB'e giden faturadaki TL karşılığını belirliyor (`mysoft-mapper.ts` → `currencyRate`). Genel muhasebe pratiği ve VUK m.280 uyarınca dövizli işlemlerin TL karşılığının hesaplanmasında TCMB **döviz alış kuru** esas alınır. Satış kuru kullanılması, her USD/EUR faturada TL tutarını (dolayısıyla KDV matrahını) sistematik olarak farklı gösterebilir. Bu döviz bazlı işlem hacmi yüksek kullanıcılarda tekrarlayan bir sapma yaratır — muhasebeciye danışılıp kesin doğrulanmalı, ardından `ForexBuying` alanına geçilmesi değerlendirilmeli.
*Kaynak:* VUK m.280 (yabancı para değerlemesi), genel muhasebe/fatura pratiği. Kesin uygulama detayı (bazı entegratörlerin/GİB özel senaryolarının satış kuru kabul edip etmediği) muhasebeciyle teyit edilmeli.

**2. Fatura toplamları iki farklı yoldan geliyor, tevkifatlı faturada tutarsızlık riski**
Liste ekranındaki toplam (`mysoft-mapper.ts` → `mapMysoftHeaderToGibLike`) Mysoft'un `payableAmount` alanını kullanıyor — bu zaten tevkifat düşülmüş, fiilen tahsil edilecek tutar. Ancak `invoice-detail/index.ts` içindeki `parseTotalsFromHtml`, eksik kayıtlarda GİB önizleme HTML'inden regex ile "Vergiler Dahil Toplam Tutar" metnini okuyup `gross_total` olarak kaydediyor — bu değer tevkifat düşülmeden önceki tutar. Aynı tevkifatlı fatura için liste ile detay ekranı (veya `invoice_totals`/`invoice_financial_summary` ile fatura detayı) farklı rakam gösterebilir. Ayrıca HTML metin ayrıştırma (regex + "TL" araması) GİB şablon metni değişirse sessizce yanlış/`null` değer üretebilecek kırılgan bir yöntem.
*Öneri:* Detay ekranında da tevkifat sonrası "ödenecek tutar" alanını önceliklendir; mümkünse regex yerine yapılandırılmış alan kullan.

**3. Ölü kod: `buildInvoiceDetails` iskontoyu hiç hesaba katmıyor**
`invoice-mapper.ts` içindeki `buildInvoiceDetails` fonksiyonu `quantity*unitPrice` üzerinden KDV hesaplıyor, `discount_rate`/`discount_amount` alanlarını tamamen görmezden geliyor. Gerçek GİB gönderimini oluşturan `buildMysoftInvoiceOutboxBody` (mysoft-mapper.ts) iskontoyu doğru şekilde düşüyor (`computeLineAmounts`), yani bu fonksiyon şu an sadece log/summarize (`summarizeGibInvoicePayload`) için kullanılıyor ve üretime gitmiyor. Yine de ölü kod ileride yanlışlıkla yeniden bağlanırsa iskontolu faturalarda hatalı KDV/matrah üretme riski taşır.
*Öneri:* Fonksiyonu kaldır veya iskonto desteğiyle güncelle; log amaçlı kullanım devam edecekse en azından yorum ile "gerçek GİB gönderiminde KULLANILMIYOR" uyarısı eklenmeli.

## NICE-TO-HAVE

- Mal ihracatı (istisna 301) ve teşvikli yatırım malları (308) bilinçli olarak desteklenmiyor (`UNSUPPORTED_ISTISNA_CODES`) ve kullanıcı doğru şekilde mali müşavirine yönlendiriliyor — iyi bir pratik, ileride talep gelirse roadmap'e alınabilir.
- Tevkifatlı faturanın iadesi, özel düzeltme kuralları gerekçesiyle desteklenmiyor (KDV Genel Uygulama Tebliği I/C-2.1.4.4 referansıyla kodda belirtilmiş) — dikkatli ve doğru bir sınırlama.
- `KDV_ISTISNA_CODES` listesi oldukça kapsamlı; yeni torba yasa/tebliğ değişikliklerinden sonra GİB'in güncel kod listesiyle periyodik çapraz kontrol önerilir.
- Nihai tüketici (TCKN) alıcılara GİB'in 30.000 TL zorunluluk haddinden bağımsız olarak her durumda e-Arşiv kesiliyor olması mevzuata tam uyumlu ve ihtiyatlı bir tercih; ek aksiyon gerekmiyor.

## Bu taramada doğrulanan / hâlâ geçerli olan noktalar

- KDV oranları kodda `enum: [0, 1, 10, 20]` olarak doğru — 7346 sayılı Cumhurbaşkanı Kararı (10.07.2023) ile gelen %1/%10/%20 yapısı 2026 itibarıyla hâlâ geçerli.
- Kısmi tevkifat alt sınırı kodda 12.000 TL — VUK 588 Sıra No.lu Tebliğ ile 1 Ocak 2026'dan itibaren geçerli güncel değerle birebir örtüşüyor.
- e-Fatura/e-Arşiv ayrımı alıcının GİB e-Fatura mükellefiyet durumuna göre doğru otomatik belirleniyor (`isEfaturaRecipient`); yurt dışı alıcıya her zaman e-Arşiv kesiliyor.
- Tevkifatlı e-Fatura'nın (alıcının reddedebilmesi gerektiği için) TEMELFATURA yerine TİCARİFATURA profiliyle gönderilmesi mevzuata uygun, doğru bir detay.

## Kaynaklar (WebSearch)

- [KDV Tevkifat Oranları 2026 — Müşavirler Kulübü](https://musavirlerkulubu.com.tr/makale/kdv-tevkifat-oranlari-tablosu-ve-uygulamasi-2026-guncel-rehber)
- [Nakliye Tevkifat Sınırı 2026: 12.000 TL — Faturaport](https://faturaport.com/blog/vergi/nakliye-tevkifat-siniri-2026-guncel-tutar-hesaplama-ve-uygulama-rehberi)
- [7346 Sayılı Cumhurbaşkanı Kararı — Grant Thornton](https://www.grantthornton.com.tr/vergi-sirkuleri/2023-vergi-sirkuleri/7436-sayili-cumhurbaskani-karari-ile-kdv-oranlarinda-degisiklik-yapilmistir/)
- [2026 E-Fatura Zorunluluk Limitleri — Finrota](https://finrota.com/blog/2026-e-fatura-zorunluluk-limitleri-ve-gecis-rehberi)
- [E-Arşiv Fatura Limitleri 2026 — Faturaport](https://faturaport.com/blog/e-fatura/e-arsiv-fatura-limitleri-2026-kim-hangi-tutarda-nasil-kesmek-zorunda)
- [Yabancı Para Birimi İle Düzenlenen Faturalarda Muhasebe Düzeni — muhasebetr.com](https://www.muhasebetr.com/yazarlarimiz/mvefatoroslu/001/)

## Atanan görevler / bir sonraki tarama için not

Co-founder'ın triage için: yukarıdaki 3 "geliştirilmeli" bulgusu, özellikle #1 (döviz kuru), Kadri'ye ayrıca hatırlatılmalı çünkü kullanıcıya görünen fatura tutarlarını etkiliyor. `/areas/finla-compliance-review.md` bu ortamda güncellenemedi; bu dosyanın içeriği oraya manuel taşınmalı veya bir sonraki taramada bu dosya (`docs/compliance/2026-08-31-muhasebeci-denetim.md`) önceki bulgu olarak okunmalı.
