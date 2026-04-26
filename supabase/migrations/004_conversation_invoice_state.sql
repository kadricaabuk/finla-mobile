alter table conversations
  add column if not exists pending_invoice jsonb,
  add column if not exists last_invoice jsonb;
