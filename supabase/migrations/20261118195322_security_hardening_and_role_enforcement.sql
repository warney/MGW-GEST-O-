-- MGW Gestão: endurecimento de permissões e isolamento multi-tenant.
-- A migração é aditiva: preserva contas, dados operacionais e arquivos.
BEGIN;

-- Funções de trigger e automação interna não são endpoints RPC.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_user_profile_default_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_tenant_member_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_tenant_protected_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_tenant_id_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_privileged_db_role() FROM PUBLIC, anon, authenticated;

-- Funções auxiliares de autorização só podem ser consultadas por sessões autenticadas.
REVOKE ALL ON FUNCTION public.get_my_tenant_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_ids() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_tenant_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_tenant_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_active_tenant_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_tenant_access(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_tenant_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_role(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_tenant_role(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(uuid, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_pending_memberships() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_pending_memberships() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_tenant_with_owner(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accept_tenant_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_online_order_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_online_order_viewed(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transition_online_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_online_order_status(uuid, text, text) TO authenticated, service_role;

-- O endpoint de leitura pública do cardápio e o fluxo público de pedidos
-- permanecem disponíveis anonimamente por requisito funcional; os RPCs
-- validam slug, disponibilidade, conteúdo, preço e token no servidor.
REVOKE ALL ON FUNCTION public.get_public_digital_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_public_online_order(text, text, text, text, text, text, text, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_online_order(text, text, text, text, text, text, text, numeric, text, jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_public_order_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_by_token(text) TO anon, authenticated, service_role;

-- Reforça o modelo RBAC na tabela de membros e mantém a regra de não autoelevação.
ALTER TABLE public.tenant_members DROP CONSTRAINT IF EXISTS chk_tenant_members_role;
ALTER TABLE public.tenant_members ADD CONSTRAINT chk_tenant_members_role
  CHECK (role IN ('owner', 'admin', 'manager', 'staff'));

-- Remove políticas permissivas antigas caso tenham sobrevivido com nomes legados.
DROP POLICY IF EXISTS expenses_select_member ON public.expenses;
CREATE POLICY expenses_select_by_role ON public.expenses
  FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS expenses_insert_active_member ON public.expenses;
CREATE POLICY expenses_insert_by_role ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS expenses_update_active_member ON public.expenses;
CREATE POLICY expenses_update_by_role ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS expenses_delete_active_member ON public.expenses;
CREATE POLICY expenses_delete_by_role ON public.expenses
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']));

-- Staff registra vendas; manager/admin/owner podem ler e editar; exclusão restrita.
DROP POLICY IF EXISTS sales_insert_active_member ON public.sales;
CREATE POLICY sales_insert_by_role ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager','staff']));

DROP POLICY IF EXISTS sales_update_active_member ON public.sales;
CREATE POLICY sales_update_by_role ON public.sales
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS sales_delete_active_member ON public.sales;
CREATE POLICY sales_delete_by_role ON public.sales
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']));

-- Manager opera catálogo; apenas owner/admin podem remover registros.
DROP POLICY IF EXISTS products_insert_active_member ON public.products;
CREATE POLICY products_insert_by_role ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS products_update_active_member ON public.products;
CREATE POLICY products_update_by_role ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS products_delete_active_member ON public.products;
CREATE POLICY products_delete_by_role ON public.products
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS combos_insert_active_member ON public.combos;
CREATE POLICY combos_insert_by_role ON public.combos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS combos_update_active_member ON public.combos;
CREATE POLICY combos_update_by_role ON public.combos
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin','manager']));

DROP POLICY IF EXISTS combos_delete_active_member ON public.combos;
CREATE POLICY combos_delete_by_role ON public.combos
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']));

-- Configurações e identidade do cardápio permanecem restritas a owner/admin.
DROP POLICY IF EXISTS shop_settings_insert_active_member ON public.shop_settings;
CREATE POLICY shop_settings_insert_by_role ON public.shop_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS shop_settings_update_active_member ON public.shop_settings;
CREATE POLICY shop_settings_update_by_role ON public.shop_settings
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','admin']))
  WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner','admin']));

-- Índices de isolamento usados pelos predicados de acesso mais frequentes.
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_active_tenant
  ON public.tenant_members (user_id, active, tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_date
  ON public.sales (tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date
  ON public.expenses (tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_products_tenant_active
  ON public.products (tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_combos_tenant_active
  ON public.combos (tenant_id, active);

COMMIT;
