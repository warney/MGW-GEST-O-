-- MGW Parceiros: atribuição de campanhas e associação segura entre lead e indicação.
begin;

alter table public.mgw_partner_referrals
  add column if not exists campaign_id uuid references public.mgw_partner_campaigns(id) on delete set null;
create index if not exists idx_mgw_partner_referrals_campaign
  on public.mgw_partner_referrals(campaign_id,created_at desc);

create or replace function public.sync_mgw_partner_referral_attribution()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $function$
declare
  v_email text;
  v_phone text;
  v_campaign_slug text;
  v_campaign_id uuid;
  v_match_count integer;
  v_lead_id uuid;
begin
  select lower(btrim(u.email)),regexp_replace(coalesce(u.phone,u.raw_user_meta_data->>'phone',''),'[^0-9]','','g'),
    nullif(lower(btrim(u.raw_user_meta_data->>'partner_campaign_slug')),'')
  into v_email,v_phone,v_campaign_slug
  from auth.users u where u.id=new.referred_user_id;

  if v_campaign_slug is not null then
    select c.id into v_campaign_id from public.mgw_partner_campaigns c
    where c.slug=v_campaign_slug and c.status='active'
      and (c.starts_at is null or c.starts_at<=now())
      and (c.ends_at is null or c.ends_at>now())
    limit 1;
    if v_campaign_id is not null then
      update public.mgw_partner_referrals set campaign_id=v_campaign_id where id=new.id;
    end if;
  end if;

  if v_email is not null then
    select count(*),min(l.id) into v_match_count,v_lead_id
    from public.mgw_partner_leads l
    where l.partner_id=new.partner_id and lower(btrim(l.email))=v_email
      and l.converted_referral_id is null and l.stage not in ('converted','not_converted');
  end if;

  if coalesce(v_match_count,0)<>1 and length(coalesce(v_phone,''))>=10 then
    select count(*),min(l.id) into v_match_count,v_lead_id
    from public.mgw_partner_leads l
    where l.partner_id=new.partner_id
      and regexp_replace(coalesce(l.phone,''),'[^0-9]','','g')=v_phone
      and l.converted_referral_id is null and l.stage not in ('converted','not_converted');
  end if;

  if coalesce(v_match_count,0)=1 and v_lead_id is not null then
    update public.mgw_partner_leads
    set converted_referral_id=new.id,
      campaign_id=coalesce(campaign_id,v_campaign_id),
      updated_at=now()
    where id=v_lead_id and partner_id=new.partner_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_mgw_partner_referral_attribution on public.mgw_partner_referrals;
create trigger trg_mgw_partner_referral_attribution
after insert on public.mgw_partner_referrals
for each row execute function public.sync_mgw_partner_referral_attribution();

create or replace function public.sync_mgw_partner_lead_conversion()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
begin
  if old.status is distinct from new.status and new.status='converted' then
    update public.mgw_partner_leads
    set stage='converted',updated_at=now()
    where converted_referral_id=new.id and partner_id=new.partner_id;
  elsif old.status='converted' and new.status='registered' then
    update public.mgw_partner_leads
    set stage='awaiting_decision',updated_at=now()
    where converted_referral_id=new.id and partner_id=new.partner_id and stage='converted';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_mgw_partner_lead_conversion_sync on public.mgw_partner_referrals;
create trigger trg_mgw_partner_lead_conversion_sync
after update of status on public.mgw_partner_referrals
for each row execute function public.sync_mgw_partner_lead_conversion();

create or replace function public.validate_mgw_partner_lead_converted_stage()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
begin
  if new.stage='converted' and not exists(
    select 1 from public.mgw_partner_referrals r
    where r.id=new.converted_referral_id and r.partner_id=new.partner_id and r.status='converted'
  ) then
    raise exception 'O interessado só pode ser marcado como convertido após o primeiro pagamento aprovado do cliente.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_mgw_partner_lead_converted_stage_guard on public.mgw_partner_leads;
create trigger trg_mgw_partner_lead_converted_stage_guard
before insert or update of stage,converted_referral_id,partner_id on public.mgw_partner_leads
for each row execute function public.validate_mgw_partner_lead_converted_stage();

comment on column public.mgw_partner_referrals.campaign_id is
  'Campanha atribuida no cadastro do estabelecimento quando o link de campanha foi usado.';

commit;
