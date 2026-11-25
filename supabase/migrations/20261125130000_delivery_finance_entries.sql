create table if not exists public.delivery_finance_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.online_orders(id) on delete cascade,
  dispatch_id uuid references public.delivery_dispatches(id) on delete set null,
  courier_id uuid references public.delivery_couriers(id) on delete set null,
  order_number integer not null,
  customer_name text not null default '',
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  courier_amount numeric(12,2) not null default 0 check (courier_amount >= 0),
  payout_status text not null default 'pending' check (payout_status in ('pending','paid')),
  payment_method text,
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_finance_entries_tenant_order_unique unique (tenant_id, order_id)
);
create index if not exists delivery_finance_entries_tenant_status_idx on public.delivery_finance_entries(tenant_id, payout_status, created_at desc);
create index if not exists delivery_finance_entries_tenant_courier_idx on public.delivery_finance_entries(tenant_id, courier_id, created_at desc);
alter table public.delivery_finance_entries enable row level security;
drop policy if exists delivery_finance_entries_select_tenant on public.delivery_finance_entries;
create policy delivery_finance_entries_select_tenant on public.delivery_finance_entries for select to authenticated using (public.has_active_tenant_access(tenant_id) and public.has_tenant_role(tenant_id, array['owner','admin','manager']::text[]));
drop policy if exists delivery_finance_entries_insert_tenant on public.delivery_finance_entries;
create policy delivery_finance_entries_insert_tenant on public.delivery_finance_entries for insert to authenticated with check (public.has_active_tenant_access(tenant_id) and public.has_tenant_role(tenant_id, array['owner','admin','manager']::text[]));
drop policy if exists delivery_finance_entries_update_tenant on public.delivery_finance_entries;
create policy delivery_finance_entries_update_tenant on public.delivery_finance_entries for update to authenticated using (public.has_active_tenant_access(tenant_id) and public.has_tenant_role(tenant_id, array['owner','admin','manager']::text[])) with check (public.has_active_tenant_access(tenant_id) and public.has_tenant_role(tenant_id, array['owner','admin','manager']::text[]));
drop policy if exists delivery_finance_entries_delete_tenant on public.delivery_finance_entries;
create policy delivery_finance_entries_delete_tenant on public.delivery_finance_entries for delete to authenticated using (public.has_active_tenant_access(tenant_id) and public.has_tenant_role(tenant_id, array['owner','admin']::text[]));
