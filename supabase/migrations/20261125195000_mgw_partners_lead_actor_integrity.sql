-- Preserva a autoria real dos registros de CRM, independentemente do payload do cliente.
begin;

create or replace function public.stamp_mgw_partner_lead_actor()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op='INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.updated_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists trg_mgw_partner_lead_actor_stamp on public.mgw_partner_leads;
create trigger trg_mgw_partner_lead_actor_stamp
before insert or update on public.mgw_partner_leads
for each row execute function public.stamp_mgw_partner_lead_actor();

revoke all on function public.stamp_mgw_partner_lead_actor() from public,anon,authenticated;

commit;
