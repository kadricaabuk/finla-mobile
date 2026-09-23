-- FIN-62: time-limited invoice share links + recipient feedback comments.
-- Edge Functions use service_role (bypasses RLS); deny direct PostgREST access.

create table if not exists public.invoice_share_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token_hash text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  invoice_uuid text not null,
  direction text not null default 'outgoing'
    check (direction in ('outgoing', 'incoming')),
  conversation_id uuid references public.conversations(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  comment_count int not null default 0
    check (comment_count >= 0)
);

create index if not exists idx_invoice_share_links_user
  on public.invoice_share_links (user_id, created_at desc);

create index if not exists idx_invoice_share_links_invoice
  on public.invoice_share_links (user_id, invoice_uuid, direction);

create table if not exists public.invoice_share_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  share_link_id uuid not null
    references public.invoice_share_links(id) on delete cascade,
  body text not null,
  author_label text,
  notified_at timestamptz
);

create index if not exists idx_invoice_share_comments_link
  on public.invoice_share_comments (share_link_id, created_at asc);

alter table public.invoice_share_links enable row level security;
alter table public.invoice_share_links force row level security;

alter table public.invoice_share_comments enable row level security;
alter table public.invoice_share_comments force row level security;

revoke all on table public.invoice_share_links from anon, authenticated;
revoke all on table public.invoice_share_comments from anon, authenticated;
