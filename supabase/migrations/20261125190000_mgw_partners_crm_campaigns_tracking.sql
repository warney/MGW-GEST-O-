-- MGW Parceiros: CRM de interessados, rastreamento de acessos, campanhas e biblioteca.
-- Migracao aditiva: preserva as tabelas e regras existentes de indicacoes/comissoes.
begin;

create table if not exists public.mgw_partner_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  objective text not null default '',
  target_segment text not null default 'all',
  instructions text not null default '',
  status text not null default 'draft'
    check (status in ('draft','scheduled','active','ended','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mgw_partner_campaign_slug_valid check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  constraint mgw_partner_campaign_name_valid check (char_length(btrim(name)) between 2 and 140),
  constraint mgw_partner_campaign_dates_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists idx_mgw_partner_campaigns_status_dates
  on public.mgw_partner_campaigns(status, starts_at, ends_at);

create table if not exists public.mgw_partner_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null default 'general'
    check (category in ('social','whatsapp','video','banner','presentation','tutorial','document','general')),
  cover_url text,
  resource_url text not null,
  resource_type text not null default 'link'
    check (resource_type in ('link','image','video','document')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mgw_partner_material_title_valid check (char_length(btrim(title)) between 2 and 160),
  constraint mgw_partner_material_url_valid check (resource_url ~* '^https?://'),
  constraint mgw_partner_material_cover_url_valid check (cover_url is null or cover_url ~* '^https?://')
);
create index if not exists idx_mgw_partner_materials_active_order
  on public.mgw_partner_materials(active, sort_order, created_at desc);

create table if not exists public.mgw_partner_campaign_materials (
  campaign_id uuid not null references public.mgw_partner_campaigns(id) on delete cascade,
  material_id uuid not null references public.mgw_partner_materials(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (campaign_id, material_id)
);

create table if not exists public.mgw_partner_link_clicks (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.mgw_partners(id) on delete restrict,
  campaign_id uuid references public.mgw_partner_campaigns(id) on delete set null,
  referral_code text not null,
  occurred_at timestamptz not null default now(),
  constraint mgw_partner_click_code_valid check (referral_code ~ '^[A-Z0-9]{8,16}$')
);
create index if not exists idx_mgw_partner_clicks_partner_date
  on public.mgw_partner_link_clicks(partner_id, occurred_at desc);
create index if not exists idx_mgw_partner_clicks_campaign_date
  on public.mgw_partner_link_clicks(campaign_id, occurred_at desc);

create table if not exists public.mgw_partner_leads (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.mgw_partners(id) on delete restrict,
  campaign_id uuid references public.mgw_partner_campaigns(id) on delete set null,
  contact_name text not null,
  establishment_name text not null,
  phone text not null default '',
  email text not null default '',
  segment text not null default '',
  city text not null default '',
  notes text not null default '',
  next_follow_up_at timestamptz,
  stage text not null default 'new'
    check (stage in ('new','contacted','demo_scheduled','demo_completed','awaiting_decision','converted','not_converted')),
  converted_referral_id uuid unique references public.mgw_partner_referrals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint mgw_partner_lead_contact_valid check (char_length(btrim(contact_name)) between 2 and 120),
  constraint mgw_partner_lead_establishment_valid check (char_length(btrim(establishment_name)) between 2 and 160),
  constraint mgw_partner_lead_phone_valid check (char_length(phone) <= 40),
  constraint mgw_partner_lead_email_valid check (char_length(email) <= 254),
  constraint mgw_partner_lead_segment_valid check (char_length(segment) <= 80),
  constraint mgw_partner_lead_city_valid check (char_length(city) <= 120),
  constraint mgw_partner_lead_notes_valid check (char_length(notes) <= 3000)
);
create index if not exists idx_mgw_partner_leads_partner_stage_updated
  on public.mgw_partner_leads(partner_id, stage, updated_at desc);
create index if not exists idx_mgw_partner_leads_follow_up
  on public.mgw_partner_leads(partner_id, next_follow_up_at)
  where next_follow_up_at is not null;
create index if not exists idx_mgw_partner_leads_campaign
  on public.mgw_partner_leads(campaign_id, created_at desc);

create table if not exists public.mgw_partner_lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null, -- UUID preservado inclusive quando o lead é excluído.
  partner_id uuid not null references public.mgw_partners(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created','updated','stage_changed','deleted')),
  old_stage text,
  new_stage text,
  occurred_at timestamptz not null default now()
);
create index if not exists idx_mgw_partner_lead_events_partner_date
  on public.mgw_partner_lead_events(partner_id, occurred_at desc);

-- RLS: parceiros só acessam seus próprios leads; Super Admin tem visão global.
alter table public.mgw_partner_campaigns enable row level security;
alter table public.mgw_partner_materials enable row level security;
alter table public.mgw_partner_campaign_materials enable row level security;
alter table public.mgw_partner_link_clicks enable row level security;
alter table public.mgw_partner_leads enable row level security;
alter table public.mgw_partner_lead_events enable row level security;

drop policy if exists mgw_partner_campaigns_partner_read on public.mgw_partner_campaigns;
create policy mgw_partner_campaigns_partner_read on public.mgw_partner_campaigns
for select to authenticated
using (
  (status = 'active' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
    and exists (select 1 from public.mgw_partners p where p.user_id = auth.uid() and p.status = 'active'))
  or public.is_platform_admin(array['super_admin'])
);
drop policy if exists mgw_partner_campaigns_admin_write on public.mgw_partner_campaigns;
create policy mgw_partner_campaigns_admin_write on public.mgw_partner_campaigns
for all to authenticated
using (public.is_platform_admin(array['super_admin']))
with check (public.is_platform_admin(array['super_admin']));

drop policy if exists mgw_partner_materials_partner_read on public.mgw_partner_materials;
create policy mgw_partner_materials_partner_read on public.mgw_partner_materials
for select to authenticated
using (
  (active and exists (select 1 from public.mgw_partners p where p.user_id = auth.uid() and p.status = 'active'))
  or public.is_platform_admin(array['super_admin'])
);
drop policy if exists mgw_partner_materials_admin_write on public.mgw_partner_materials;
create policy mgw_partner_materials_admin_write on public.mgw_partner_materials
for all to authenticated
using (public.is_platform_admin(array['super_admin']))
with check (public.is_platform_admin(array['super_admin']));

drop policy if exists mgw_partner_campaign_materials_partner_read on public.mgw_partner_campaign_materials;
create policy mgw_partner_campaign_materials_partner_read on public.mgw_partner_campaign_materials
for select to authenticated
using (
  exists (
    select 1 from public.mgw_partner_campaigns c
    where c.id = campaign_id and c.status = 'active'
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at > now())
  )
  and exists (select 1 from public.mgw_partners p where p.user_id = auth.uid() and p.status = 'active')
  or public.is_platform_admin(array['super_admin'])
);
drop policy if exists mgw_partner_campaign_materials_admin_write on public.mgw_partner_campaign_materials;
create policy mgw_partner_campaign_materials_admin_write on public.mgw_partner_campaign_materials
for all to authenticated
using (public.is_platform_admin(array['super_admin']))
with check (public.is_platform_admin(array['super_admin']));

drop policy if exists mgw_partner_leads_owner_access on public.mgw_partner_leads;
create policy mgw_partner_leads_owner_access on public.mgw_partner_leads
for all to authenticated
using (
  exists (select 1 from public.mgw_partners p where p.id = partner_id and p.user_id = auth.uid() and p.status = 'active')
  or public.is_platform_admin(array['super_admin'])
)
with check (
  exists (select 1 from public.mgw_partners p where p.id = partner_id and p.user_id = auth.uid() and p.status = 'active')
  or public.is_platform_admin(array['super_admin'])
);

drop policy if exists mgw_partner_lead_events_owner_read on public.mgw_partner_lead_events;
create policy mgw_partner_lead_events_owner_read on public.mgw_partner_lead_events
for select to authenticated
using (
  exists (select 1 from public.mgw_partners p where p.id = partner_id and p.user_id = auth.uid() and p.status = 'active')
  or public.is_platform_admin(array['super_admin'])
);

-- Cliques não ficam expostos por SELECT; só a função pública registra eventos sem dados pessoais.
revoke all on table public.mgw_partner_link_clicks from public, anon, authenticated;
revoke all on table public.mgw_partner_lead_events from public, anon, authenticated;
grant select, insert, update, delete on public.mgw_partner_campaigns,
  public.mgw_partner_materials, public.mgw_partner_campaign_materials,
  public.mgw_partner_leads to authenticated;
grant select on public.mgw_partner_lead_events to authenticated;
grant usage, select on sequence public.mgw_partner_link_clicks_id_seq,
  public.mgw_partner_lead_events_id_seq to service_role;

create or replace function public.record_mgw_partner_link_click(
  p_referral_code text,
  p_campaign_slug text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_partner public.mgw_partners%rowtype;
  v_campaign_id uuid;
begin
  if p_referral_code is null or upper(btrim(p_referral_code)) !~ '^[A-Z0-9]{8,16}$' then
    return false;
  end if;
  select * into v_partner
  from public.mgw_partners
  where referral_code = upper(btrim(p_referral_code)) and status = 'active';
  if not found then return false; end if;

  if nullif(btrim(p_campaign_slug), '') is not null then
    select id into v_campaign_id
    from public.mgw_partner_campaigns
    where slug = lower(btrim(p_campaign_slug))
      and status = 'active'
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now());
    if v_campaign_id is null then return false; end if;
  end if;

  insert into public.mgw_partner_link_clicks(partner_id, campaign_id, referral_code)
  values(v_partner.id, v_campaign_id, v_partner.referral_code);
  return true;
end;
$function$;
revoke all on function public.record_mgw_partner_link_click(text,text) from public;
grant execute on function public.record_mgw_partner_link_click(text,text) to anon, authenticated;

-- Histórico automático de criação, edição, mudança de etapa e exclusão dos interessados.
create or replace function public.audit_mgw_partner_lead_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_partner_id uuid;
  v_lead_id uuid;
  v_old_stage text;
  v_new_stage text;
  v_action text;
begin
  if tg_op = 'DELETE' then
    v_partner_id := old.partner_id;
    v_lead_id := old.id;
    v_old_stage := old.stage;
    v_action := 'deleted';
    insert into public.mgw_partner_lead_events(lead_id,partner_id,actor_user_id,action,old_stage,new_stage)
    values(v_lead_id,v_partner_id,auth.uid(),v_action,v_old_stage,null);
    return old;
  end if;

  v_partner_id := new.partner_id;
  v_lead_id := new.id;
  v_new_stage := new.stage;
  if tg_op = 'INSERT' then
    v_action := 'created';
  else
    v_old_stage := old.stage;
    v_action := case when old.stage is distinct from new.stage then 'stage_changed' else 'updated' end;
  end if;
  insert into public.mgw_partner_lead_events(lead_id,partner_id,actor_user_id,action,old_stage,new_stage)
  values(v_lead_id,v_partner_id,auth.uid(),v_action,v_old_stage,v_new_stage);
  return new;
end;
$function$;
drop trigger if exists trg_mgw_partner_lead_audit on public.mgw_partner_leads;
create trigger trg_mgw_partner_lead_audit
after insert or update or delete on public.mgw_partner_leads
for each row execute function public.audit_mgw_partner_lead_change();

-- Impede vincular a um lead uma indicação pertencente a outro parceiro.
create or replace function public.validate_mgw_partner_lead_referral()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.converted_referral_id is not null and not exists (
    select 1 from public.mgw_partner_referrals r
    where r.id = new.converted_referral_id and r.partner_id = new.partner_id
  ) then
    raise exception 'A indicação selecionada não pertence a este parceiro.';
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_mgw_partner_lead_referral_guard on public.mgw_partner_leads;
create trigger trg_mgw_partner_lead_referral_guard
before insert or update of partner_id, converted_referral_id on public.mgw_partner_leads
for each row execute function public.validate_mgw_partner_lead_referral();

comment on table public.mgw_partner_link_clicks is
  'Eventos agregáveis de acesso a links de indicação. Não armazena IP, user-agent ou dados pessoais.';
comment on table public.mgw_partner_leads is
  'CRM de interessados. RLS limita parceiros aos próprios registros; Super Admin possui visão global.';
comment on table public.mgw_partner_lead_events is
  'Trilha de auditoria das alterações de interessados.';
comment on table public.mgw_partner_campaigns is
  'Campanhas comerciais criadas e gerenciadas pelo Super Admin.';
comment on table public.mgw_partner_materials is
  'Biblioteca de materiais de divulgação gerenciada pelo Super Admin.';

commit;
