-- ============================================================================
-- MGW GESTAO — HARDENING DE ESCRITA DOS PEDIDOS ONLINE
-- Migration: 20261118000001_harden_online_order_status_writes.sql
--
-- Esta migration e aditiva e nao altera nem remove dados.
-- As mudancas de status devem ocorrer exclusivamente pela RPC
-- transition_online_order_status(), que valida papel, tenant e transicao,
-- registra historico e cria a venda de forma idempotente ao concluir.
--
-- NAO aplicar em producao antes de validar as migrations 001-003 e a
-- compatibilidade do ambiente. Esta migration apenas prepara a correcao.
-- ============================================================================

BEGIN;

-- A migration 003 concedeu UPDATE direto em online_orders a authenticated.
-- Isso permite contornar a maquina de estados e o historico da RPC.
REVOKE UPDATE ON TABLE public.online_orders FROM PUBLIC, anon, authenticated;

-- Remover a policy de UPDATE direto. A RPC SECURITY DEFINER continua sendo
-- o unico caminho de escrita para os status; SELECT continua protegido por RLS.
DROP POLICY IF EXISTS online_orders_update_member ON public.online_orders;

-- Garantir que clientes anonimos nao recebam privilegios de escrita.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.online_orders FROM PUBLIC, anon;

-- Verificacao defensiva: falhar a transacao se authenticated ainda puder
-- atualizar diretamente a tabela.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.online_orders', 'UPDATE') THEN
    RAISE EXCEPTION
      'Hardening abortado: authenticated ainda possui UPDATE em public.online_orders.';
  END IF;
END;
$$;

COMMIT;
