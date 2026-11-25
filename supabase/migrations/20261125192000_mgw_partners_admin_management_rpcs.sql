-- MGW Parceiros: API administrativa auditada exclusivamente por RPC.
begin;

create or replace function public.admin_list_mgw_partner_campaigns()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_items jsonb;
begin
  perform public.assert_platform_admin(array['super_admin'],false);
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]'::jsonb)
  into v_items from public.mgw_partner_campaigns c;
  return v_items;
end;
$function$;

create or replace function public.admin_list_mgw_partner_materials()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_items jsonb;
begin
  perform public.assert_platform_admin(array['super_admin'],false);
  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order,m.created_at desc),'[]'::jsonb)
  into v_items from public.mgw_partner_materials m;
  return v_items;
end;
$function$;

create or replace function public.admin_list_mgw_partner_leads(p_limit integer default 300)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_items jsonb;
begin
  perform public.assert_platform_admin(array['super_admin'],false);
  if p_limit is null or p_limit<1 or p_limit>1000 then raise exception 'Limite de leads invalido.'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_items from (
    select l.id,l.partner_id,l.contact_name,l.establishment_name,l.phone,l.email,l.segment,l.city,
      l.stage,l.created_at,p.full_name partner_name,p.email partner_email
    from public.mgw_partner_leads l join public.mgw_partners p on p.id=l.partner_id
    order by l.created_at desc limit p_limit
  ) x;
  return v_items;
end;
$function$;

create or replace function public.admin_create_mgw_partner_campaign(
  p_slug text,p_name text,p_objective text default '',p_target_segment text default 'all',
  p_instructions text default '',p_starts_at timestamptz default now(),p_ends_at timestamptz default null
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_row public.mgw_partner_campaigns%rowtype;
begin
  perform public.assert_platform_admin(array['super_admin'],true);
  insert into public.mgw_partner_campaigns(slug,name,objective,target_segment,instructions,status,starts_at,ends_at,created_by)
  values(lower(btrim(p_slug)),btrim(p_name),left(coalesce(p_objective,''),300),left(coalesce(p_target_segment,'all'),80),
    left(coalesce(p_instructions,''),3000),'active',p_starts_at,p_ends_at,auth.uid())
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.admin_set_mgw_partner_campaign_status(p_campaign_id uuid,p_status text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_row public.mgw_partner_campaigns%rowtype;
begin
  perform public.assert_platform_admin(array['super_admin'],true);
  if p_status not in ('active','ended','archived') then raise exception 'Status de campanha invalido.'; end if;
  update public.mgw_partner_campaigns set status=p_status,updated_at=now()
  where id=p_campaign_id returning * into v_row;
  if not found then raise exception 'Campanha nao encontrada.'; end if;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.admin_create_mgw_partner_material(
  p_title text,p_description text,p_category text,p_resource_url text,p_resource_type text,p_campaign_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_row public.mgw_partner_materials%rowtype;
begin
  perform public.assert_platform_admin(array['super_admin'],true);
  insert into public.mgw_partner_materials(title,description,category,resource_url,resource_type,created_by,active)
  values(btrim(p_title),left(coalesce(p_description,''),1000),p_category,btrim(p_resource_url),p_resource_type,auth.uid(),true)
  returning * into v_row;
  if p_campaign_id is not null then
    insert into public.mgw_partner_campaign_materials(campaign_id,material_id)
    values(p_campaign_id,v_row.id);
  end if;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.admin_set_mgw_partner_material_active(p_material_id uuid,p_active boolean)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $function$
declare v_row public.mgw_partner_materials%rowtype;
begin
  perform public.assert_platform_admin(array['super_admin'],true);
  update public.mgw_partner_materials set active=p_active,updated_at=now()
  where id=p_material_id returning * into v_row;
  if not found then raise exception 'Material nao encontrado.'; end if;
  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.admin_list_mgw_partner_campaigns() from public,anon,authenticated;
revoke all on function public.admin_list_mgw_partner_materials() from public,anon,authenticated;
revoke all on function public.admin_list_mgw_partner_leads(integer) from public,anon,authenticated;
revoke all on function public.admin_create_mgw_partner_campaign(text,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.admin_set_mgw_partner_campaign_status(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_create_mgw_partner_material(text,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.admin_set_mgw_partner_material_active(uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_list_mgw_partner_campaigns() to authenticated;
grant execute on function public.admin_list_mgw_partner_materials() to authenticated;
grant execute on function public.admin_list_mgw_partner_leads(integer) to authenticated;
grant execute on function public.admin_create_mgw_partner_campaign(text,text,text,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.admin_set_mgw_partner_campaign_status(uuid,text) to authenticated;
grant execute on function public.admin_create_mgw_partner_material(text,text,text,text,text,uuid) to authenticated;
grant execute on function public.admin_set_mgw_partner_material_active(uuid,boolean) to authenticated;

commit;
