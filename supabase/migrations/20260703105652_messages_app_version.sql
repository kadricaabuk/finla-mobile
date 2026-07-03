-- Mesaja hizmet veren chat function sürümü (analizde versiyon ayrımı için).
alter table messages
  add column if not exists app_version text;
