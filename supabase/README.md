# Infraestrutura Supabase — MGW GESTÃO (Etapa 1)

Este diretório contém a preparação estrutural do banco PostgreSQL no Supabase para transformar o **MGW GESTÃO** em plataforma SaaS multi-tenant, sem alterar o frontend atual conectado ao Firebase.

## Estrutura de Arquivos

- `migrations/20261114000001_initial_saas_schema.sql` — Schema base da Etapa 1 (`tenants`, `tenant_members`, `subscriptions`, `mp_webhook_events`, `shop_settings`, `products`, `combos`, `sales`, `expenses`), constraints, índices, triggers de proteção e políticas RLS.
- `migrations/20261116000001_etapa4_multi_tenant_rbac_and_plans.sql` — Migration aditiva da Fase 4.1 (não executada): catálogo `plans` (`founder_exempt`, `free`, `trial`, `mgw_mensal_49`), `user_profiles`, `tenant_invitations` com token hash SHA-256, papéis RBAC (`owner`, `admin`, `manager`, `staff`), RPCs seguras `create_tenant_with_owner` / `accept_tenant_invitation` e políticas RLS granulares.
- `migrations/20261117000001_digital_menu_and_online_orders.sql` — Migration aditiva do Cardápio Digital e Pedidos Online: `digital_menu_settings`, `online_orders`, `online_order_items`, `online_order_status_history`, `online_order_realtime_pings` (sem PII para acompanhamento público), colunas de origem em `sales` (`sale_origin`, `online_order_id`, `delivery_fee`) e RPCs `get_public_digital_menu`, `create_public_online_order`, `get_public_order_by_token`, `transition_online_order_status`.
- `seeds/001_founding_tenants.sql` — Template idempotente para pré-vincular as contas fundadoras (`warney.fernandes22@gmail.com`, `fernandes38mk@gmail.com`, `gf3163666@gmail.com`) com isenção de cobrança (`billing_exempt = true` / `status = 'exempt'`) e `user_id = NULL` (sem IDs fictícios).
- `../docs/FASE_4_1_ARQUITETURA_MULTI_TENANT_RLS.md` — Diagnóstico técnico, arquitetura multi-tenant, matriz RBAC e plano de isolamento RLS da Fase 4.1.

## Variáveis de Ambiente Necessárias

Documentadas em `.env.example` (nenhum segredo real deve ser commitado no Git):

### Frontend (Públicas — prefixo `VITE_`)
- `VITE_SUPABASE_URL`: URL pública do projeto Supabase.
- `VITE_SUPABASE_ANON_KEY`: Chave pública `anon` (segura apenas porque todas as tabelas possuem RLS estrito).

### Backend Serverless / Vercel e Scripts Administrativos (Privadas — NUNCA usar `VITE_`)
- `SUPABASE_URL`: Mesma URL do projeto Supabase para uso no servidor.
- `SUPABASE_SERVICE_ROLE_KEY`: Chave administrativa usada exclusivamente em Serverless Functions (`/api/*`) e no script de migração ETL. **Nunca expor no frontend.**
- `SUPABASE_DB_URL`: Connection string PostgreSQL para execução de migrations via Supabase CLI/CI.

## Configurações Manuais Necessárias no Painel Supabase

1. **Criar Projeto Supabase:** Selecionar região `sa-east-1` (São Paulo) para menor latência no Brasil.
2. **Authentication → Providers:**
   - Habilitar **Email/Password** com confirmação de e-mail obrigatória (`Confirm email = ON`) — essencial para garantir que `auth.users.email_confirmed_at` seja válido antes de `claim_pending_memberships()`.
   - Habilitar **Google OAuth** (configurando Client ID e Client Secret no Google Cloud Console com o callback `https://<PROJECT_REF>.supabase.co/auth/v1/callback`) para manter a mesma fluidez de login das contas existentes.
3. **Authentication → URL Configuration:**
   - Definir `Site URL` para o domínio de produção (e incluir `http://localhost:3000/**` e domínios Preview da Vercel em `Redirect URLs`).
4. **Database → Replication / Realtime:**
   - Habilitar Realtime nas tabelas `shop_settings`, `products`, `combos`, `sales`, `expenses`, `digital_menu_settings`, `online_orders`, `online_order_items`, `online_order_status_history` e `online_order_realtime_pings`.
5. **Execução das Migrations:**
   - Aplicar `migrations/20261114000001_initial_saas_schema.sql`, `migrations/20261116000001_etapa4_multi_tenant_rbac_and_plans.sql` e `migrations/20261117000001_digital_menu_and_online_orders.sql` via `supabase db push` ou SQL Editor após revisão.
   - Aplicar `seeds/001_founding_tenants.sql` apenas na etapa autorizada de migração/provisionamento.
