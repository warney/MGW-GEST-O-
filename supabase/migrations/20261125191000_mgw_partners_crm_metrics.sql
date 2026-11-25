-- MGW Parceiros: consultas agregadas para o portal e Super Admin.
begin;

create or replace function public.partner_get_crm_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_partner public.mgw_partners%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  select * into v_partner
  from public.mgw_partners
  where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Conta de parceiro ativa nao encontrada.'; end if;

  select jsonb_build_object(
    'click_count', (select count(*) from public.mgw_partner_link_clicks c where c.partner_id = v_partner.id),
    'clicks_30d', (select count(*) from public.mgw_partner_link_clicks c where c.partner_id = v_partner.id and c.occurred_at >= now() - interval '30 days'),
    'lead_count', (select count(*) from public.mgw_partner_leads l where l.partner_id = v_partner.id),
    'open_lead_count', (select count(*) from public.mgw_partner_leads l where l.partner_id = v_partner.id and l.stage not in ('converted','not_converted')),
    'demo_count', (select count(*) from public.mgw_partner_leads l where l.partner_id = v_partner.id and l.stage in ('demo_scheduled','demo_completed')),
    'converted_lead_count', (select count(*) from public.mgw_partner_leads l where l.partner_id = v_partner.id and l.stage = 'converted'),
    'leads_by_stage', coalesce((
      select jsonb_object_agg(s.stage, s.total)
      from (select stage, count(*) total from public.mgw_partner_leads where partner_id = v_partner.id group by stage) s
    ), '{}'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'name', c.name,
        'clicks', (select count(*) from public.mgw_partner_link_clicks lc where lc.partner_id = v_partner.id and lc.campaign_id = c.id),
        'leads', (select count(*) from public.mgw_partner_leads l where l.partner_id = v_partner.id and l.campaign_id = c.id)
      ) order by c.starts_at desc nulls last, c.created_at desc)
      from public.mgw_partner_campaigns c
      where c.status = 'active' and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now())
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.admin_get_partner_crm_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_result jsonb;
begin
  perform public.assert_platform_admin(array['super_admin'], false);
  select jsonb_build_object(
    'partners', (select count(*) from public.mgw_partners),
    'clicks', (select count(*) from public.mgw_partner_link_clicks),
    'clicks_30d', (select count(*) from public.mgw_partner_link_clicks where occurred_at >= now() - interval '30 days'),
    'leads', (select count(*) from public.mgw_partner_leads),
    'open_leads', (select count(*) from public.mgw_partner_leads where stage not in ('converted','not_converted')),
    'converted_leads', (select count(*) from public.mgw_partner_leads where stage = 'converted'),
    'campaigns_active', (select count(*) from public.mgw_partner_campaigns where status = 'active' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())),
    'materials_active', (select count(*) from public.mgw_partner_materials where active),
    'by_partner', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partner_id', p.id, 'partner_name', p.full_name, 'email', p.email,
        'clicks', (select count(*) from public.mgw_partner_link_clicks c where c.partner_id = p.id),
        'leads', (select count(*) from public.mgw_partner_leads l where l.partner_id = p.id),
        'converted_leads', (select count(*) from public.mgw_partner_leads l where l.partner_id = p.id and l.stage = 'converted'),
        'referrals', (select count(*) from public.mgw_partner_referrals r where r.partner_id = p.id),
        'converted_referrals', (select count(*) from public.mgw_partner_referrals r where r.partner_id = p.id and r.status = 'converted')
      ) order by p.created_at desc)
      from public.mgw_partners p
    ), '[]'::jsonb),
    'by_campaign', coalesce((
      select jsonb_agg(jsonb_build_object(
        'campaign_id', c.id, 'name', c.name, 'status', c.status,
        'clicks', (select count(*) from public.mgw_partner_link_clicks lc where lc.campaign_id = c.id),
        'leads', (select count(*) from public.mgw_partner_leads l where l.campaign_id = c.id)
      ) order by c.created_at desc)
      from public.mgw_partner_campaigns c
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.partner_get_crm_dashboard() from public;
grant execute on function public.partner_get_crm_dashboard() to authenticated;
revoke all on function public.admin_get_partner_crm_overview() from public, anon, authenticated;
grant execute on function public.admin_get_partner_crm_overview() to authenticated;

commit;
