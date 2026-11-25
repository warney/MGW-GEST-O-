-- Ajustes finais de RLS e índices para as novas tabelas do programa.
begin;

drop policy if exists mgw_partner_campaigns_admin_write on public.mgw_partner_campaigns;
drop policy if exists mgw_partner_materials_admin_write on public.mgw_partner_materials;
drop policy if exists mgw_partner_campaign_materials_admin_write on public.mgw_partner_campaign_materials;

drop policy if exists mgw_partner_campaigns_partner_read on public.mgw_partner_campaigns;
create policy mgw_partner_campaigns_partner_read on public.mgw_partner_campaigns
for select to authenticated
using (
  (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
    and exists (
      select 1 from public.mgw_partners p
      where p.user_id = (select auth.uid()) and p.status = 'active'
    )
  )
  or (select public.is_platform_admin(array['super_admin']))
);

drop policy if exists mgw_partner_materials_partner_read on public.mgw_partner_materials;
create policy mgw_partner_materials_partner_read on public.mgw_partner_materials
for select to authenticated
using (
  (
    active
    and exists (
      select 1 from public.mgw_partners p
      where p.user_id = (select auth.uid()) and p.status = 'active'
    )
  )
  or (select public.is_platform_admin(array['super_admin']))
);

drop policy if exists mgw_partner_campaign_materials_partner_read on public.mgw_partner_campaign_materials;
create policy mgw_partner_campaign_materials_partner_read on public.mgw_partner_campaign_materials
for select to authenticated
using (
  (
    exists (
      select 1 from public.mgw_partner_campaigns c
      where c.id = campaign_id and c.status = 'active'
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now())
    )
    and exists (
      select 1 from public.mgw_partners p
      where p.user_id = (select auth.uid()) and p.status = 'active'
    )
  )
  or (select public.is_platform_admin(array['super_admin']))
);

drop policy if exists mgw_partner_leads_owner_access on public.mgw_partner_leads;
create policy mgw_partner_leads_owner_access on public.mgw_partner_leads
for all to authenticated
using (
  exists (
    select 1 from public.mgw_partners p
    where p.id = partner_id and p.user_id = (select auth.uid()) and p.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.mgw_partners p
    where p.id = partner_id and p.user_id = (select auth.uid()) and p.status = 'active'
  )
);

drop policy if exists mgw_partner_lead_events_owner_read on public.mgw_partner_lead_events;
create policy mgw_partner_lead_events_owner_read on public.mgw_partner_lead_events
for select to authenticated
using (
  exists (
    select 1 from public.mgw_partners p
    where p.id = partner_id and p.user_id = (select auth.uid()) and p.status = 'active'
  )
  or (select public.is_platform_admin(array['super_admin']))
);

create index if not exists idx_mgw_partner_campaign_materials_material
  on public.mgw_partner_campaign_materials(material_id);
create index if not exists idx_mgw_partner_campaigns_created_by
  on public.mgw_partner_campaigns(created_by);
create index if not exists idx_mgw_partner_lead_events_actor
  on public.mgw_partner_lead_events(actor_user_id);
create index if not exists idx_mgw_partner_leads_created_by
  on public.mgw_partner_leads(created_by);
create index if not exists idx_mgw_partner_leads_updated_by
  on public.mgw_partner_leads(updated_by);
create index if not exists idx_mgw_partner_materials_created_by
  on public.mgw_partner_materials(created_by);

commit;
