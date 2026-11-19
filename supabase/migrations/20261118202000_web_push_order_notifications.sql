-- Web Push notifications for newly received online orders.
-- Does not modify existing order data, RPC signatures, or billing rules.
create extension if not exists pg_net with schema extensions;

create table if not exists public.tenant_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  is_enabled boolean not null default true,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_push_subscriptions_tenant_user_endpoint_key unique (tenant_id, user_id, endpoint)
);

create index if not exists tenant_push_subscriptions_tenant_enabled_idx
  on public.tenant_push_subscriptions (tenant_id, is_enabled)
  where is_enabled = true;

alter table public.tenant_push_subscriptions enable row level security;
drop policy if exists "Members manage own push subscriptions" on public.tenant_push_subscriptions;
create policy "Members manage own push subscriptions"
  on public.tenant_push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id))
  with check (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));

revoke all on public.tenant_push_subscriptions from anon;
grant select, insert, update, delete on public.tenant_push_subscriptions to authenticated;
grant all on public.tenant_push_subscriptions to service_role;

create or replace function public.dispatch_new_order_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net
as $$
declare
  v_webhook_secret text;
begin
  select decrypted_secret into v_webhook_secret
  from vault.decrypted_secrets
  where name = 'mgw_push_webhook_secret'
  limit 1;

  if v_webhook_secret is null or btrim(v_webhook_secret) = '' then
    raise warning 'MGW Web Push is not configured: Vault secret mgw_push_webhook_secret is missing.';
    return new;
  end if;

  perform net.http_post(
    url := 'https://rlinibriiwbkdqjrfapd.supabase.co/functions/v1/send-order-push',
    body := jsonb_build_object('record', jsonb_build_object('id', new.id, 'tenant_id', new.tenant_id)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mgw-push-secret', v_webhook_secret),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'MGW Web Push dispatch failed for order %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.dispatch_new_order_push() from public, anon, authenticated;
drop trigger if exists online_orders_dispatch_push on public.online_orders;
create trigger online_orders_dispatch_push
  after insert on public.online_orders
  for each row when (new.status = 'received')
  execute function public.dispatch_new_order_push();
