-- MGW Parceiros: comissoes unicas e pagamento manual individual via Pix.
begin;

create table if not exists public.mgw_partner_program_settings (
  id integer primary key default 1 check(id=1),
  commission_percent numeric(5,2) not null default 15.00 check(commission_percent between 0 and 100),
  payout_enabled boolean not null default false check(payout_enabled=false),
  payout_schedule_day text not null default 'friday' check(payout_schedule_day='friday'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.mgw_partner_program_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.mgw_partner_payout_profiles (
  partner_id uuid primary key references public.mgw_partners(id) on delete cascade,
  pix_key_ciphertext text not null,
  pix_key_type text not null check(pix_key_type in ('cpf','cnpj','email','phone','random')),
  holder_name text not null,
  updated_at timestamptz not null default now(),
  constraint mgw_partner_pix_ciphertext_len check(char_length(pix_key_ciphertext) between 30 and 500),
  constraint mgw_partner_holder_name_len check(char_length(btrim(holder_name)) between 2 and 120)
);

create table if not exists public.mgw_partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.mgw_partners(id) on delete restrict,
  referral_id uuid not null unique references public.mgw_partner_referrals(id) on delete restrict,
  tenant_id uuid not null unique references public.tenants(id) on delete restrict,
  source_payment_id uuid not null unique references public.platform_payments(id) on delete restrict,
  base_amount_cents integer not null check(base_amount_cents>0),
  commission_percent numeric(5,2) not null check(commission_percent between 0 and 100),
  amount_cents integer not null check(amount_cents>=0),
  status text not null default 'available' check(status in ('available','paid','cancelled')),
  payment_method text check(payment_method is null or payment_method='manual_pix'),
  payment_reference text,
  payment_note text not null default '',
  paid_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mgw_partner_payment_note_len check(char_length(payment_note)<=500)
);
create index if not exists idx_mgw_partner_commissions_partner_created
  on public.mgw_partner_commissions(partner_id,created_at desc);
create index if not exists idx_mgw_partner_commissions_status_created
  on public.mgw_partner_commissions(status,created_at desc);
create unique index if not exists uq_mgw_partner_commission_payment_reference
  on public.mgw_partner_commissions(lower(btrim(payment_reference)))
  where payment_reference is not null;

alter table public.mgw_partner_payout_profiles enable row level security;
alter table public.mgw_partner_commissions enable row level security;
alter table public.mgw_partner_program_settings enable row level security;
revoke all on table public.mgw_partner_payout_profiles,public.mgw_partner_commissions,
  public.mgw_partner_program_settings from public,anon,authenticated;

create or replace function public.partner_get_dashboard()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth
as $$
declare v_partner public.mgw_partners%rowtype; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  select * into v_partner from public.mgw_partners where user_id=auth.uid() and status='active';
  if not found then raise exception 'Conta de parceiro ativa nao encontrada.'; end if;
  select jsonb_build_object(
    'referral_count',(select count(*) from public.mgw_partner_referrals r where r.partner_id=v_partner.id),
    'converted_count',(select count(*) from public.mgw_partner_referrals r where r.partner_id=v_partner.id and r.status='converted'),
    'pending_cents',coalesce((select sum(c.amount_cents) from public.mgw_partner_commissions c where c.partner_id=v_partner.id and c.status='available'),0),
    'paid_cents',coalesce((select sum(c.amount_cents) from public.mgw_partner_commissions c where c.partner_id=v_partner.id and c.status='paid'),0),
    'commission_percent',(select s.commission_percent from public.mgw_partner_program_settings s where s.id=1),
    'referrals',coalesce((
      select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'created_at',r.created_at,'converted_at',r.converted_at) order by r.created_at desc)
      from (select * from public.mgw_partner_referrals where partner_id=v_partner.id order by created_at desc limit 50) r
    ),'[]'::jsonb),
    'commissions',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'amount_cents',c.amount_cents,'base_amount_cents',c.base_amount_cents,
        'commission_percent',c.commission_percent,'status',c.status,'created_at',c.created_at,
        'paid_at',c.paid_at,'payment_reference',c.payment_reference,'payment_method',c.payment_method)
      order by c.created_at desc)
      from (select * from public.mgw_partner_commissions where partner_id=v_partner.id order by created_at desc limit 100) c
    ),'[]'::jsonb),
    'payout_profile',(select jsonb_build_object('has_pix_key',true,'pix_key_type',p.pix_key_type,'holder_name',p.holder_name)
      from public.mgw_partner_payout_profiles p where p.partner_id=v_partner.id)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.create_mgw_partner_commission()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare v_ref public.mgw_partner_referrals%rowtype; v_percent numeric(5,2); v_commission_id uuid;
begin
  if new.status<>'approved' or new.amount_cents<=0 then return new; end if;
  select * into v_ref from public.mgw_partner_referrals
  where tenant_id=new.tenant_id and status='registered' for update;
  if not found then return new; end if;
  select commission_percent into v_percent from public.mgw_partner_program_settings where id=1;
  if v_percent is null then v_percent:=15.00; end if;

  insert into public.mgw_partner_commissions(
    partner_id,referral_id,tenant_id,source_payment_id,base_amount_cents,
    commission_percent,amount_cents,status
  ) values(
    v_ref.partner_id,v_ref.id,new.tenant_id,new.id,new.amount_cents,
    v_percent,round(new.amount_cents::numeric*v_percent/100)::integer,'available'
  ) on conflict do nothing returning id into v_commission_id;

  if v_commission_id is not null then
    update public.mgw_partner_referrals set status='converted',converted_at=coalesce(converted_at,now())
    where id=v_ref.id and status='registered';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_mgw_partner_commission_on_insert on public.platform_payments;
create trigger trg_mgw_partner_commission_on_insert after insert on public.platform_payments
for each row when(new.status='approved') execute function public.create_mgw_partner_commission();
drop trigger if exists trg_mgw_partner_commission_on_status_update on public.platform_payments;
create trigger trg_mgw_partner_commission_on_status_update after update of status on public.platform_payments
for each row when(new.status='approved' and old.status is distinct from new.status)
execute function public.create_mgw_partner_commission();

create or replace function public.admin_list_mgw_partners()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth
as $$
declare v_items jsonb;
begin
  perform public.assert_platform_admin(array['super_admin'],false);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_items
  from (
    select p.id,p.email,p.full_name,p.referral_code,p.status,p.created_at,
      (select count(*) from public.mgw_partner_referrals r where r.partner_id=p.id) referral_count,
      (select count(*) from public.mgw_partner_referrals r where r.partner_id=p.id and r.status='converted') converted_count,
      coalesce((select sum(c.amount_cents) from public.mgw_partner_commissions c where c.partner_id=p.id and c.status='available'),0) pending_cents,
      coalesce((select sum(c.amount_cents) from public.mgw_partner_commissions c where c.partner_id=p.id and c.status='paid'),0) paid_cents
    from public.mgw_partners p
  ) x;
  return v_items;
end;
$$;

create or replace function public.admin_list_mgw_partner_commissions(p_status text default 'available')
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth
as $$
declare v_items jsonb;
begin
  perform public.assert_platform_admin(array['super_admin'],false);
  if p_status not in ('available','paid','all') then raise exception 'Filtro de comissoes invalido.'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_items
  from (
    select c.id,c.partner_id,p.full_name partner_name,p.email partner_email,p.referral_code,
      c.base_amount_cents,c.commission_percent,c.amount_cents,c.status,c.created_at,c.paid_at,
      c.payment_reference,c.payment_method,c.payment_note,
      (pp.partner_id is not null) has_pix_key,pp.pix_key_type,pp.holder_name pix_holder_name
    from public.mgw_partner_commissions c
    join public.mgw_partners p on p.id=c.partner_id
    left join public.mgw_partner_payout_profiles pp on pp.partner_id=c.partner_id
    where p_status='all' or c.status=p_status
  ) x;
  return v_items;
end;
$$;

create or replace function public.admin_mark_mgw_partner_commission_paid(
  p_commission_id uuid,p_payment_reference text,p_payment_note text default ''
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare
  v_admin public.platform_admins%rowtype;
  v_before public.mgw_partner_commissions%rowtype;
  v_after public.mgw_partner_commissions%rowtype;
  v_reference text:=left(btrim(coalesce(p_payment_reference,'')),180);
  v_note text:=btrim(coalesce(p_payment_note,''));
begin
  v_admin:=public.assert_platform_admin(array['super_admin'],true);
  if char_length(v_reference)<8 then raise exception 'Informe o identificador da transferencia Pix (minimo 8 caracteres).'; end if;
  if char_length(v_note)>500 then raise exception 'Observacao excede 500 caracteres.'; end if;
  select * into v_before from public.mgw_partner_commissions where id=p_commission_id for update;
  if not found then raise exception 'Comissao nao encontrada.'; end if;
  if v_before.status<>'available' then raise exception 'Comissao indisponivel ou ja paga.'; end if;
  if not exists(select 1 from public.mgw_partner_payout_profiles pp where pp.partner_id=v_before.partner_id) then
    raise exception 'Parceiro ainda nao cadastrou chave Pix.';
  end if;
  if exists(select 1 from public.mgw_partner_commissions c where lower(btrim(c.payment_reference))=lower(v_reference)) then
    raise exception 'Identificador de transferencia ja utilizado.';
  end if;
  update public.mgw_partner_commissions set status='paid',payment_method='manual_pix',
    payment_reference=v_reference,payment_note=v_note,paid_by=v_admin.user_id,
    paid_at=now(),updated_at=now()
  where id=p_commission_id returning * into v_after;
  perform public.write_platform_audit_log(v_admin,'mgw_partner_commission_paid',
    'mgw_partner_commission',p_commission_id::text,to_jsonb(v_before),to_jsonb(v_after),
    'Confirmacao de pagamento Pix manual',jsonb_build_object('amount_cents',v_after.amount_cents,'payment_method','manual_pix'));
  return jsonb_build_object('id',v_after.id,'status',v_after.status,'amount_cents',v_after.amount_cents,'paid_at',v_after.paid_at);
end;
$$;

create or replace function public.admin_audit_mgw_partner_pix_access(p_partner_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_admin public.platform_admins%rowtype; v_profile public.mgw_partner_payout_profiles%rowtype;
begin
  v_admin:=public.assert_platform_admin(array['super_admin'],true);
  select * into v_profile from public.mgw_partner_payout_profiles where partner_id=p_partner_id;
  if not found then raise exception 'Chave Pix nao cadastrada.'; end if;
  perform public.write_platform_audit_log(v_admin,'mgw_partner_pix_key_viewed',
    'mgw_partner_payout_profile',p_partner_id::text,null,
    jsonb_build_object('pix_key_type',v_profile.pix_key_type,'holder_name',v_profile.holder_name),
    'Consulta da chave Pix para pagamento manual',jsonb_build_object('sensitive_data','pix_key'));
  return jsonb_build_object('audited',true);
end;
$$;

create or replace function public.admin_update_mgw_partner(
  p_partner_id uuid,p_status text,p_reason text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_admin public.platform_admins%rowtype; v_before public.mgw_partners%rowtype;
  v_after public.mgw_partners%rowtype; v_reason text:=left(btrim(coalesce(p_reason,'')),500);
begin
  v_admin:=public.assert_platform_admin(array['super_admin'],true);
  if p_status not in ('active','suspended','blocked') or char_length(v_reason)<3 then
    raise exception 'Status ou motivo administrativo invalido.';
  end if;
  select * into v_before from public.mgw_partners where id=p_partner_id for update;
  if not found then raise exception 'Parceiro nao encontrado.'; end if;
  update public.mgw_partners set status=p_status,updated_at=now() where id=p_partner_id returning * into v_after;
  perform public.write_platform_audit_log(v_admin,'mgw_partner_status_updated','mgw_partner',
    p_partner_id::text,to_jsonb(v_before),to_jsonb(v_after),v_reason,'{}'::jsonb);
  return jsonb_build_object('id',v_after.id,'status',v_after.status);
end;
$$;

create or replace function public.admin_update_mgw_partner_settings(p_commission_percent numeric,p_reason text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_admin public.platform_admins%rowtype; v_before public.mgw_partner_program_settings%rowtype;
  v_after public.mgw_partner_program_settings%rowtype; v_reason text:=left(btrim(coalesce(p_reason,'')),500);
begin
  v_admin:=public.assert_platform_admin(array['super_admin'],true);
  if p_commission_percent is null or p_commission_percent not between 0 and 100 or char_length(v_reason)<3 then
    raise exception 'Percentual ou motivo invalido.';
  end if;
  select * into v_before from public.mgw_partner_program_settings where id=1 for update;
  update public.mgw_partner_program_settings set commission_percent=p_commission_percent,
    updated_by=v_admin.user_id,updated_at=now() where id=1 returning * into v_after;
  perform public.write_platform_audit_log(v_admin,'mgw_partner_program_settings_updated',
    'mgw_partner_program','1',to_jsonb(v_before),to_jsonb(v_after),v_reason,'{}'::jsonb);
  return to_jsonb(v_after);
end;
$$;

create or replace function public.admin_get_mgw_partner_settings()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth
as $$
begin
  perform public.assert_platform_admin(array['super_admin'],false);
  return (select to_jsonb(s) from public.mgw_partner_program_settings s where id=1);
end;
$$;

revoke all on function public.partner_get_dashboard() from public,anon;
grant execute on function public.partner_get_dashboard() to authenticated;
revoke all on function public.create_mgw_partner_commission() from public,anon,authenticated;
revoke all on function public.admin_list_mgw_partners() from public,anon,authenticated;
grant execute on function public.admin_list_mgw_partners() to authenticated;
revoke all on function public.admin_list_mgw_partner_commissions(text) from public,anon,authenticated;
grant execute on function public.admin_list_mgw_partner_commissions(text) to authenticated;
revoke all on function public.admin_mark_mgw_partner_commission_paid(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_mark_mgw_partner_commission_paid(uuid,text,text) to authenticated;
revoke all on function public.admin_audit_mgw_partner_pix_access(uuid) from public,anon,authenticated;
grant execute on function public.admin_audit_mgw_partner_pix_access(uuid) to authenticated;
revoke all on function public.admin_update_mgw_partner(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_update_mgw_partner(uuid,text,text) to authenticated;
revoke all on function public.admin_update_mgw_partner_settings(numeric,text) from public,anon,authenticated;
grant execute on function public.admin_update_mgw_partner_settings(numeric,text) to authenticated;
revoke all on function public.admin_get_mgw_partner_settings() from public,anon,authenticated;
grant execute on function public.admin_get_mgw_partner_settings() to authenticated;
commit;
