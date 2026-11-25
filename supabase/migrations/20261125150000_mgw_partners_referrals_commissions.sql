-- MGW Parceiros: atribuicao, configuracao comercial, comissoes e RPCs seguros.
begin;

create table if not exists public.mgw_partner_program_settings (
  id integer primary key default 1 check (id = 1),
  commission_percent numeric(5,2) not null default 15.00 check (commission_percent >= 0 and commission_percent <= 100),
  payout_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.mgw_partner_program_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.mgw_partner_payout_profiles (
  partner_id uuid primary key references public.mgw_partners(id) on delete cascade,
  pix_key_ciphertext text not null,
  pix_key_type text not null check (pix_key_type in ('cpf','cnpj','email','phone','random')),
  holder_name text not null,
  updated_at timestamptz not null default now(),
  constraint mgw_partner_pix_ciphertext_len check (char_length(pix_key_ciphertext) between 30 and 500),
  constraint mgw_partner_holder_name_len check (char_length(btrim(holder_name)) between 2 and 120)
);

create table if not exists public.mgw_partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.mgw_partners(id) on delete restrict,
  referral_id uuid not null unique references public.mgw_partner_referrals(id) on delete restrict,
  tenant_id uuid not null unique references public.tenants(id) on delete restrict,
  source_payment_id uuid not null unique references public.platform_payments(id) on delete restrict,
  base_amount_cents integer not null check (base_amount_cents >= 0),
  commission_percent numeric(5,2) not null check (commission_percent between 0 and 100),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending','available','processing','paid','cancelled','failed')),
  payout_reference text,
  payout_id text,
  payout_transaction_id text,
  payout_status text,
  payout_last_error text,
  payout_attempted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mgw_partner_commissions_partner_created
  on public.mgw_partner_commissions (partner_id, created_at desc);
create index if not exists idx_mgw_partner_commissions_status
  on public.mgw_partner_commissions (status, created_at);

alter table public.mgw_partner_referrals enable row level security;
alter table public.mgw_partner_payout_profiles enable row level security;
alter table public.mgw_partner_commissions enable row level security;
alter table public.mgw_partner_program_settings enable row level security;

revoke all on public.mgw_partner_referrals, public.mgw_partner_payout_profiles,
  public.mgw_partner_commissions, public.mgw_partner_program_settings
from public, anon, authenticated;

create or replace function public.partner_get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_partner public.mgw_partners%rowtype;
  v_result jsonb;
begin
  select * into v_partner from public.mgw_partners
  where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Conta de parceiro ativa nao encontrada.'; end if;

  select jsonb_build_object(
    'referral_count', (select count(*) from public.mgw_partner_referrals r where r.partner_id = v_partner.id),
    'converted_count', (select count(*) from public.mgw_partner_referrals r where r.partner_id = v_partner.id and r.status = 'converted'),
    'pending_cents', coalesce((select sum(c.amount_cents) from public.mgw_partner_commissions c where c.partner_id = v_partner.id and c.status in ('pending','available')),0),
    'paid_cents', coalesce((select sum(c.amount_cents) from public.mgw_partner_commissions c where c.partner_id = v_partner.id and c.status = 'paid'),0),
    'commission_percent', (select s.commission_percent from public.mgw_partner_program_settings s where s.id=1),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'created_at',r.created_at,'converted_at',r.converted_at) order by r.created_at desc)
      from (select * from public.mgw_partner_referrals where partner_id=v_partner.id order by created_at desc limit 50) r
    ), '[]'::jsonb),
    'commissions', coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'amount_cents',c.amount_cents,'status',c.status,'created_at',c.created_at,'paid_at',c.paid_at) order by c.created_at desc)
      from (select * from public.mgw_partner_commissions where partner_id=v_partner.id order by created_at desc limit 50) c
    ), '[]'::jsonb),
    'payout_profile', (select jsonb_build_object('has_pix_key',true,'pix_key_type',p.pix_key_type,'holder_name',p.holder_name) from public.mgw_partner_payout_profiles p where p.partner_id=v_partner.id)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.create_mgw_partner_commission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_ref public.mgw_partner_referrals%rowtype; v_percent numeric(5,2);
begin
  if new.status <> 'approved' then return new; end if;
  select * into v_ref from public.mgw_partner_referrals
  where tenant_id=new.tenant_id and status='registered' for update;
  if not found then return new; end if;

  select commission_percent into v_percent from public.mgw_partner_program_settings where id=1;
  if v_percent is null then v_percent := 15.00; end if;

  insert into public.mgw_partner_commissions(
    partner_id,referral_id,tenant_id,source_payment_id,base_amount_cents,commission_percent,amount_cents,status
  ) values (
    v_ref.partner_id,v_ref.id,new.tenant_id,new.id,new.amount_cents,v_percent,
    round(new.amount_cents * v_percent / 100)::integer,'available'
  ) on conflict do nothing;

  update public.mgw_partner_referrals
  set status='converted',converted_at=coalesce(converted_at,now())
  where id=v_ref.id and status='registered';
  return new;
end;
$$;
drop trigger if exists trg_mgw_partner_commission_on_insert on public.platform_payments;
create trigger trg_mgw_partner_commission_on_insert
after insert on public.platform_payments
for each row when (new.status='approved')
execute function public.create_mgw_partner_commission();

drop trigger if exists trg_mgw_partner_commission_on_status_update on public.platform_payments;
create trigger trg_mgw_partner_commission_on_status_update
after update of status on public.platform_payments
for each row when (new.status='approved' and old.status is distinct from new.status)
execute function public.create_mgw_partner_commission();

create or replace function public.admin_claim_mgw_partner_commission(p_commission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $
declare
  v_admin public.platform_admins%rowtype;
  v_commission public.mgw_partner_commissions%rowtype;
  v_profile public.mgw_partner_payout_profiles%rowtype;
  v_partner public.mgw_partners%rowtype;
begin
  v_admin := public.assert_platform_admin(array['super_admin'], true);
  select * into v_commission from public.mgw_partner_commissions
    where id=p_commission_id for update;
  if not found then raise exception 'Comissao nao encontrada.'; end if;
  if v_commission.status not in ('available','failed','processing') then
    raise exception 'Comissao nao esta disponivel para repasse.';
  end if;
  if v_commission.payout_id is not null then
    raise exception 'Este repasse ja foi enviado ao Mercado Pago.';
  end if;
  if not exists(select 1 from public.mgw_partner_program_settings where id=1 and payout_enabled=true) then
    raise exception 'Repasse automatico ainda nao foi habilitado pelo Superadmin.';
  end if;
  select * into v_partner from public.mgw_partners where id=v_commission.partner_id and status='active';
  if not found then raise exception 'Parceiro nao esta ativo.'; end if;
  select * into v_profile from public.mgw_partner_payout_profiles where partner_id=v_commission.partner_id;
  if not found then raise exception 'Parceiro ainda nao cadastrou uma chave Pix.'; end if;

  update public.mgw_partner_commissions
    set status='processing', payout_reference=coalesce(payout_reference,gen_random_uuid()::text),
        payout_attempted_at=now(), payout_last_error=null, updated_at=now()
    where id=p_commission_id returning * into v_commission;

  perform public.write_platform_audit_log(
    v_admin,'mgw_partner_payout_requested','mgw_partner_commission',p_commission_id::text,
    to_jsonb(v_commission),jsonb_build_object('status','processing','payout_reference',v_commission.payout_reference),
    'Solicitacao de repasse Pix individual','{}'::jsonb
  );

  return jsonb_build_object(
    'commission_id',v_commission.id,
    'payout_reference',v_commission.payout_reference,
    'amount_cents',v_commission.amount_cents,
    'pix_key_ciphertext',v_profile.pix_key_ciphertext,
    'pix_key_type',v_profile.pix_key_type,
    'partner_name',v_profile.holder_name
  );
end;
$;

revoke all on function public.admin_claim_mgw_partner_commission(uuid) from public,anon,authenticated;
grant execute on function public.admin_claim_mgw_partner_commission(uuid) to authenticated,service_role;

create or replace function public.admin_list_mgw_partners()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
declare v_items jsonb;
begin
  perform public.assert_platform_admin(array['super_admin','finance'],false);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_items
  from (
    select p.id,p.email,p.full_name,p.referral_code,p.status,p.created_at,
      (select count(*) from public.mgw_partner_referrals r where r.partner_id=p.id) referral_count,
      (select count(*) from public.mgw_partner_referrals r where r.partner_id=p.id and r.status='converted') converted_count,
      coalesce((select sum(c.amount_cents) from public.mgw_partner_commissions c where c.partner_id=p.id and c.status in ('pending','available')),0) pending_cents,
      coalesce((select sum(c.amount_cents) from public.mgw_partner_commissions c where c.partner_id=p.id and c.status='paid'),0) paid_cents
    from public.mgw_partners p
  ) x;
  return v_items;
end;
$$;

create or replace function public.admin_update_mgw_partner(
  p_partner_id uuid, p_status text, p_reason text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_admin public.platform_admins%rowtype; v_before public.mgw_partners%rowtype; v_after public.mgw_partners%rowtype; v_reason text:=left(btrim(coalesce(p_reason,'')),500);
begin
  v_admin:=public.assert_platform_admin(array['super_admin'],true);
  if p_status not in ('active','suspended','blocked') or char_length(v_reason)<3 then raise exception 'Status ou motivo administrativo invalido.'; end if;
  select * into v_before from public.mgw_partners where id=p_partner_id for update;
  if not found then raise exception 'Parceiro nao encontrado.'; end if;
  update public.mgw_partners set status=p_status,updated_at=now() where id=p_partner_id returning * into v_after;
  perform public.write_platform_audit_log(v_admin,'mgw_partner_status_updated','mgw_partner',p_partner_id::text,to_jsonb(v_before),to_jsonb(v_after),v_reason,'{}'::jsonb);
  return jsonb_build_object('id',v_after.id,'status',v_after.status);
end;
$$;

create or replace function public.admin_update_mgw_partner_settings(
  p_commission_percent numeric,p_reason text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_admin public.platform_admins%rowtype; v_before public.mgw_partner_program_settings%rowtype; v_after public.mgw_partner_program_settings%rowtype; v_reason text:=left(btrim(coalesce(p_reason,'')),500);
begin
  v_admin:=public.assert_platform_admin(array['super_admin'],true);
  if p_commission_percent is null or p_commission_percent not between 0 and 100 or char_length(v_reason)<3 then
    raise exception 'Valor, percentual ou motivo invalido.';
  end if;
  select * into v_before from public.mgw_partner_program_settings where id=1 for update;
  update public.mgw_partner_program_settings set commission_percent=p_commission_percent,updated_by=v_admin.user_id,updated_at=now() where id=1 returning * into v_after;
  perform public.write_platform_audit_log(v_admin,'mgw_partner_program_settings_updated','mgw_partner_program','1',to_jsonb(v_before),to_jsonb(v_after),v_reason,'{}'::jsonb);
  return to_jsonb(v_after);
end;
$$;

create or replace function public.admin_get_mgw_partner_settings()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.assert_platform_admin(array['super_admin','finance'],false);
  return (select to_jsonb(s) from public.mgw_partner_program_settings s where id=1);
end;
$$;
revoke all on function public.admin_get_mgw_partner_settings() from public,anon,authenticated;
grant execute on function public.admin_get_mgw_partner_settings() to authenticated,service_role;

revoke all on function public.partner_get_dashboard() from public,anon;
grant execute on function public.partner_get_dashboard() to authenticated,service_role;
revoke all on function public.create_mgw_partner_commission() from public,anon,authenticated;
revoke all on function public.admin_list_mgw_partners() from public,anon,authenticated;
grant execute on function public.admin_list_mgw_partners() to authenticated,service_role;
revoke all on function public.admin_update_mgw_partner(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_update_mgw_partner(uuid,text,text) to authenticated,service_role;
revoke all on function public.admin_update_mgw_partner_settings(numeric,text) from public,anon,authenticated;
grant execute on function public.admin_update_mgw_partner_settings(numeric,text) to authenticated,service_role;

commit;
