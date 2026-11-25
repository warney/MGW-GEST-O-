-- Dashboard CRM exige sessão autenticada; somente o contador de cliques é público.
begin;
revoke all on function public.partner_get_crm_dashboard() from public, anon;
grant execute on function public.partner_get_crm_dashboard() to authenticated;
commit;
