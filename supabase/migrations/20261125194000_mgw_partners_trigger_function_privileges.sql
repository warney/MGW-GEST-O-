-- Reforço de privilégios: funções internas de trigger não são endpoints públicos.
begin;
revoke all on function public.audit_mgw_partner_lead_change() from public,anon,authenticated;
revoke all on function public.validate_mgw_partner_lead_referral() from public,anon,authenticated;
revoke all on function public.validate_mgw_partner_lead_converted_stage() from public,anon,authenticated;
revoke all on function public.sync_mgw_partner_referral_attribution() from public,anon,authenticated;
revoke all on function public.sync_mgw_partner_lead_conversion() from public,anon,authenticated;
commit;
