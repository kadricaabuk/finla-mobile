-- Distinguish outgoing (kesilen) vs incoming (gelen, adıma kesilen) fatura satırları.
alter table invoice_facts
  add column if not exists direction text not null default 'outgoing';

alter table invoice_facts
  drop constraint if exists invoice_facts_direction_check;
alter table invoice_facts
  add constraint invoice_facts_direction_check
  check (direction in ('outgoing', 'incoming'));

alter table invoice_facts
  drop constraint if exists invoice_facts_unique_user_invoice;

alter table invoice_facts
  add constraint invoice_facts_unique_user_invoice_dir
  unique (gib_username, invoice_uuid, direction);

create index if not exists idx_invoice_facts_user_direction_date
  on invoice_facts (gib_username, direction, issue_date desc);

-- Mevcut satış toplamları: sadece kestiğin faturalar
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
    and status = 'approved'
    and direction = 'outgoing';
$$;

-- Son fatura: kullanıcının kestiği son belge
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
    and f.direction = 'outgoing'
    and (p_start_date is null or f.issue_date >= p_start_date)
    and (p_end_date is null or f.issue_date <= p_end_date)
  order by f.issue_date desc nulls last, f.updated_at desc
  limit 1;
$$;
