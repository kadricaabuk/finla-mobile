-- Assistant message UI actions (persisted without large HTML payloads; previews load lazily).
alter table messages
  add column if not exists action_snapshot jsonb;
