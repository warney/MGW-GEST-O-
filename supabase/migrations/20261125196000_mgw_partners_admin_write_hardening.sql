-- Fecha escritas diretas que poderiam contornar os RPCs administrativos com MFA.
begin;

-- Parceiros só precisam ler campanhas/materiais; criação e manutenção passam pelos RPCs.
revoke insert, update, delete on public.mgw_partner_campaigns,
  public.mgw_partner_materials, public.mgw_partner_campaign_materials
from public, anon, authenticated;
grant select on public.mgw_partner_campaigns,
  public.mgw_partner_materials, public.mgw_partner_campaign_materials
to authenticated;

-- Acesso direto ao CRM é restrito ao dono do parceiro.
-- O Super Admin consulta a visão global exclusivamente por RPC administrativo.
drop policy if exists mgw_partner_leads_owner_access on public.mgw_partner_leads;
create policy mgw_partner_leads_owner_access on public.mgw_partner_leads
for all to authenticated
using (
  exists (
    select 1 from public.mgw_partners p
    where p.id = partner_id and p.user_id = auth.uid() and p.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.mgw_partners p
    where p.id = partner_id and p.user_id = auth.uid() and p.status = 'active'
  )
);

commit;
