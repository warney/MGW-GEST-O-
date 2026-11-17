# MGW GESTÃO — Etapa 4 / Fase 4.1: Diagnóstico Técnico, Arquitetura Multi-Tenant, RBAC e Plano de Isolamento RLS

> **Status desta fase:** Documentação, especificação arquitetural, migration SQL aditiva (`002`) preparada **sem execução em produção**, contratos TypeScript RBAC e testes unitários validados. Nenhuma migration foi executada e nenhum dado em produção foi alterado.

---

## 1. Diagnóstico Técnico da Autenticação e Estrutura Atual

### 1.1 Provedor Ativo e Fallback Seguro
- `src/lib/supabase.ts` determina o provedor único ativo via `getActiveDataProvider()`:
  - Retorna `'firebase'` quando `VITE_DATA_PROVIDER="firebase"` ou quando `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` não estão preenchidos com valores reais (rejeitando placeholders).
  - Garante que **nunca haja escrita simultânea descontrolada** nos dois bancos.
- Atualmente em produção/dev no container, o sistema opera com **Firebase Authentication + Cloud Firestore** (`src/firebase.ts`, `src/services/firestoreService.ts`, `firestore.rules`).

### 1.2 Autenticação Atual
- **Firebase (ativo no runtime atual):**
  - `signInWithPopup` com Google (`googleProvider`) e verificação `currentUser.emailVerified === true`.
  - Autorização via allowlist fixa em `src/types/finance.ts` (`ADMIN_EMAILS`, `SEPARATE_SHOP_EMAIL`) espelhada em `firestore.rules` (`isVerifiedAdmin()`, `isSeparateShopOwner()`).
- **Supabase Auth (camada pronta em `src/services/dataService.ts`):**
  - Suporta OAuth Google (`signInWithOAuth`), e-mail/senha (`signInWithPassword`) e pedido de redefinição (`resetPasswordForEmail`).
  - Exige `email_confirmed_at || confirmed_at` no cliente e no banco (`claim_pending_memberships()` verifica `auth.users.email_confirmed_at IS NOT NULL`).
  - **Lacuna corrigida para fases futuras:** ainda não trata o evento `PASSWORD_RECOVERY` (`updateUser({ password })`), nem cadastro comercial (`signUp` + onboarding de empresa).

### 1.3 Estrutura Atual de Banco e Lacunas Multi-Tenant Encontradas na Migration `001`
A migration `supabase/migrations/20261114000001_initial_saas_schema.sql` já criou as 9 tabelas base com `RLS = ON`:
- `tenants`, `tenant_members`, `subscriptions`, `mp_webhook_events`, `shop_settings`, `products`, `combos`, `sales`, `expenses`.

Durante a auditoria da Fase 4.1 foram identificadas **6 lacunas críticas** para o SaaS comercial multiempresa:
1. **Papéis insuficientes e coerção insegura no frontend:** `tenant_members.role` aceitava apenas `'owner' | 'admin'`, e `supabaseMappers.ts` convertia qualquer papel diferente de `'owner'` para `'admin'` (risco caso surgisse `'manager'` ou `'staff'`).
2. **RLS sem granularidade por papel nas tabelas operacionais:** qualquer membro com `has_active_tenant_access(tenant_id)` tinha permissão total de `INSERT/UPDATE/DELETE` em `shop_settings`, `products`, `combos`, `sales` e `expenses`.
3. **Políticas de `tenant_members` restritas e bug na alteração de papéis:** `001` restringia `UPDATE/DELETE` a `role = 'admin'` e bloqueava qualquer mudança de `role` no trigger `guard_tenant_member_changes()` para usuários não-`service_role`.
4. **Ausência de fluxo comercial de criação de empresa e convites:** `tenants` não possuía política de `INSERT` nem RPC atômica de onboarding (`create_tenant_with_owner`), e não havia tabela/RPC segura para convites (`tenant_invitations` / `accept_tenant_invitation`).
5. **Planos rígidos:** `subscriptions` fixava `plan_code = 'mgw_mensal_49'` e `plan_amount_cents = 4900`, sem catálogo `plans` nem suporte nativo a `'founder_exempt'`, `'free'` e `'trialing'`.
6. **Ausência de `user_profiles`:** preferência de empresa padrão não tinha tabela separada sem privilégios.

---

## 2. Arquitetura de Usuários, Empresas, Vínculos e Planos

```
auth.users (Supabase Auth — identidade verificada)
   ├── 1:0..1 ──▶ public.user_profiles (full_name, default_tenant_id validado)
   └── 1:N    ──▶ public.tenant_members (role: owner|admin|manager|staff, active, is_founder)
                     │
                     ▼ N:1
               public.tenants (id, slug, name, is_founder_account, billing_exempt, status)
                  ├── 1:1 ──▶ public.subscriptions ──▶ public.plans (founder_exempt|free|trial|mgw_mensal_49)
                  ├── 1:N ──▶ public.tenant_invitations (token_hash SHA-256, nunca token bruto)
                  ├── 1:1 ──▶ public.shop_settings
                  ├── 1:N ──▶ public.products
                  ├── 1:N ──▶ public.combos
                  ├── 1:N ──▶ public.sales
                  └── 1:N ──▶ public.expenses
```

### 2.1 Preservação das Contas Fundadoras e Dados Existentes
- **MGW Lanches (`mgw_lanches`):** `warney.fernandes22@gmail.com` (`owner`, fundador), `fernandes38mk@gmail.com` (`admin`, fundador), `is_founder_account = true`, `billing_exempt = true`, assinatura `'exempt'` vinculada ao plano `'founder_exempt'`.
- **Outro Lanche (`gf_lanches`):** `gf3163666@gmail.com` (`owner`, fundador), `is_founder_account = true`, `billing_exempt = true`, assinatura `'exempt'`.
- Nenhuma conta fundadora perde acesso, isenção ou dados históricos (snapshots imutáveis de vendas e datas puras `DATE YYYY-MM-DD`).

---

## 3. Matriz de Permissões (RBAC) por Empresa

| Ação / Recurso | `owner` | `admin` | `manager` | `staff` (Atendente) |
| :--- | :---: | :---: | :---: | :---: |
| Ver Dashboard / Vendas / Catálogo | Sim | Sim | Sim | Sim |
| Registrar Venda (`sales:create`) | Sim | Sim | Sim | Sim |
| Editar Venda (`sales:update`) | Sim | Sim | Sim | Não |
| Excluir Venda (`sales:delete`) | Sim | Sim | Não | Não |
| Ler / Criar / Editar Despesas (`expenses`) | Sim | Sim | Sim | Não |
| Excluir Despesa (`expenses:delete`) | Sim | Sim | Não | Não |
| Criar / Editar Produtos e Combos | Sim | Sim | Sim | Não |
| Excluir Produtos e Combos | Sim | Sim | Não | Não |
| Alterar Configurações e Metas (`shop_settings`) | Sim | Sim | Não | Não |
| Convidar / Revogar Convites (`tenant_invitations`) | Sim | Sim | Não | Não |
| Alterar Papel ou Desativar Membro (não-fundador) | Sim | Não | Não | Não |
| Alterar Dados da Empresa / Billing | Sim | Não | Não | Não |

---

## 4. Plano de Isolamento Multi-Tenant via Supabase RLS (Zero-Trust no Frontend)

### 4.1 Regra Absoluta Contra Adulteração de `company_id` / `tenant_id`
O frontend **nunca** é fonte de confiança para autorização:
- Mesmo que um cliente envie `tenant_id = '<outro-uuid>'` via DevTools, PostgREST ou `localStorage`:
  1. Todas as políticas `SELECT`, `INSERT`, `UPDATE`, `DELETE` validam `auth.uid()` diretamente em `public.tenant_members` e `public.tenants` por meio de funções `SECURITY DEFINER` mínimas (`get_my_tenant_ids()`, `is_tenant_member()`, `is_tenant_owner()`, `has_active_tenant_access()`, `has_tenant_role()`), com `SET search_path = pg_catalog, public` e `EXECUTE` revogado de `PUBLIC`/`anon`.
  2. Nenhuma política usa `user_metadata` ou claims editáveis pelo usuário para decidir empresa ou papel.
  3. O trigger `prevent_tenant_id_change()` bloqueia movimentação de registros entre empresas via `UPDATE`.
  4. O trigger `validate_user_profile_default_tenant()` impede até que `user_profiles.default_tenant_id` aponte para uma empresa à qual o usuário não pertença.
  5. `selectAuthorizedTenant()` em `src/services/rbacPolicy.ts` garante na UI que preferências locais caiam sempre dentro da lista devolvida pelo backend/RLS.

### 4.2 Proteções Contra Escalação de Privilégio e Vazamento de Segredos
- `guard_tenant_member_changes()` impede: auto-alteração (`OLD.user_id = auth.uid()`), edição de proprietários ou membros fundadores, promoção para `'owner'` via cliente e troca de `user_id`/`email`/`tenant_id`.
- `tenant_invitations` recebe `GRANT SELECT (id, tenant_id, email, role, status, ...)` **sem** `token_hash` para `authenticated`: nem proprietários conseguem ler hashes no banco, e `accept_tenant_invitation(p_raw_token)` valida SHA-256 + `expires_at` + `status = 'pending'` + correspondência exata com `auth.users.email` verificado (`email_confirmed_at IS NOT NULL`).
- `create_tenant_with_owner()` bloqueia criação de plano `'founder_exempt'` e inicia planos pagos como `'pending'` (ativação exclusiva via webhook Mercado Pago em `service_role`).
- Zero chaves `service_role` no bundle Vite ou em variáveis `VITE_*`.

---

## 5. Alterações Realizadas Nesta Fase 4.1

1. **`supabase/migrations/20261116000001_etapa4_multi_tenant_rbac_and_plans.sql`** *(criado — NÃO executado)*:
   - Migration aditiva preservando `20261114000001_initial_saas_schema.sql` intacto.
   - Adiciona `plans`, `user_profiles`, `tenant_invitations`, expansão RBAC (`owner|admin|manager|staff`), `get_my_tenant_role`, `has_tenant_role`, `create_tenant_with_owner`, `accept_tenant_invitation`, triggers anti-escalação e políticas RLS granulares.
2. **`src/types/finance.ts`**:
   - Expande `TenantRole` para `'owner' | 'admin' | 'manager' | 'staff'` e `SubscriptionStatus` para incluir `'trialing' | 'free'`.
3. **`src/services/rbacPolicy.ts`** *(novo)*:
   - Matriz oficial RBAC (`ROLE_PERMISSIONS`), catálogo de planos (`PLAN_CATALOG`), parser fail-closed `normalizeTenantRole` (desconhecido → `'staff'`), `canManageMemberRecord` e `selectAuthorizedTenant`.
4. **`src/services/supabaseMappers.ts`**:
   - Atualiza `hasActiveTenantBillingAccess` (suporte a `'free'` e `'trialing'` com `trial_ends_at`) e `buildTenantContextFromRows` (usando `normalizeTenantRole` fail-closed).
5. **`src/services/rbacPolicy.test.ts`** *(novo)*:
   - Suíte unitária cobrindo matriz RBAC, anti-escalação de privilégio, bloqueio de `tenant_id` forjado e planos/trial.
6. **`supabase/README.md` & `docs/FASE_4_1_ARQUITETURA_MULTI_TENANT_RLS.md`**:
   - Documentação completa da Fase 4.1 e ordem segura das migrations (`001` → `002`).

> **Próxima etapa (mediante aprovação explícita):** Fase 4.2/4.3 (aplicação controlada das migrations no Supabase mediante credenciais fornecidas e tratamento de `PASSWORD_RECOVERY` / fluxo de cadastro comercial).
