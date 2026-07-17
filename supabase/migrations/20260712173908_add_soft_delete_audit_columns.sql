-- Soft-delete + edit audit columns. Rows are never hard-deleted:
-- "deleting" a conversation sets deleted_at, reads filter on deleted_at is null.
alter table conversations add column if not exists deleted_at timestamptz;
alter table conversations add column if not exists edited_at timestamptz;

alter table messages add column if not exists deleted_at timestamptz;
alter table messages add column if not exists edited_at timestamptz;

-- List query filters live conversations per user, newest first.
create index if not exists conversations_user_live_idx
  on conversations (user_id, created_at desc)
  where deleted_at is null;
