alter table users
  add column onboarding_completed boolean not null default false;

-- Mevcut kullanicilar tanitimi gormesin (yalnizca yeni kullanicilar false kalir)
update users set onboarding_completed = true;
