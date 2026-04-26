create table if not exists invoice_facts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  gib_username text not null,
  invoice_uuid text not null,
  issue_date date,
  status text not null default 'unknown',
  currency text not null default 'TRY',
  gross_total numeric(18,2),
  vat_total numeric(18,2),
  net_total numeric(18,2),
  customer_tax_id text,
  customer_name text,
  raw_payload jsonb not null default '{}'::jsonb,
  constraint invoice_facts_unique_user_invoice unique (gib_username, invoice_uuid)
);

create index if not exists idx_invoice_facts_user_date
  on invoice_facts (gib_username, issue_date desc);

create index if not exists idx_invoice_facts_user_status
  on invoice_facts (gib_username, status, issue_date desc);

create or replace function touch_invoice_facts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_invoice_facts_updated_at on invoice_facts;
create trigger trg_invoice_facts_updated_at
before update on invoice_facts
for each row
execute function touch_invoice_facts_updated_at();

create or replace function get_invoice_totals(
  p_gib_username text,
  p_start_date date,
  p_end_date date
)
returns table (
  count_total bigint,
  sum_gross_total numeric(18,2),
  sum_vat_total numeric(18,2),
  sum_net_total numeric(18,2)
)
language sql
stable
as $$
  select
    count(*)::bigint as count_total,
    coalesce(sum(gross_total), 0)::numeric(18,2) as sum_gross_total,
    coalesce(sum(vat_total), 0)::numeric(18,2) as sum_vat_total,
    coalesce(sum(net_total), 0)::numeric(18,2) as sum_net_total
  from invoice_facts
  where gib_username = p_gib_username
    and issue_date between p_start_date and p_end_date
    and status = 'approved';
$$;

create or replace function get_latest_invoice(
  p_gib_username text,
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  invoice_uuid text,
  issue_date date,
  status text,
  currency text,
  gross_total numeric(18,2),
  vat_total numeric(18,2),
  net_total numeric(18,2),
  customer_tax_id text,
  customer_name text
)
language sql
stable
as $$
  select
    f.invoice_uuid,
    f.issue_date,
    f.status,
    f.currency,
    f.gross_total,
    f.vat_total,
    f.net_total,
    f.customer_tax_id,
    f.customer_name
  from invoice_facts f
  where f.gib_username = p_gib_username
    and (p_start_date is null or f.issue_date >= p_start_date)
    and (p_end_date is null or f.issue_date <= p_end_date)
  order by f.issue_date desc nulls last, f.updated_at desc
  limit 1;
$$;
