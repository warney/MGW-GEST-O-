create policy "platform_payments_select_tenant_owner"
on public.platform_payments
for select
to authenticated
using (public.is_tenant_owner(tenant_id));