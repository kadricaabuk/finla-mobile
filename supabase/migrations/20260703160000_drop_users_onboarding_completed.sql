-- Onboarding artık cihaz-lokal bir bayrakla (AsyncStorage) takip ediliyor,
-- login öncesi gösteriliyor. Sunucudaki hesap-bazlı alan kullanılmıyor.
alter table users drop column onboarding_completed;
