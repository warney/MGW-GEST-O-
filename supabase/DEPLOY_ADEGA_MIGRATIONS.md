# Publicação Supabase — expansão do segmento Adega (Etapas 2 a 5)

## Escopo

Este pacote prepara exclusivamente a estrutura de banco necessária às Etapas 2, 3, 4 e 5 já desenvolvidas no MGW Gestão. Não implementa a Etapa 6 e não altera o frontend.

## Ordem obrigatória

1. `20261127120000_etapa2_multi_segment_core.sql`
2. `20261127140000_etapa3_universal_products.sql`
3. `20261127160000_etapa4_adega_inventory.sql`
4. `20261127180000_etapa5_adega_combos.sql`

Não executar fora dessa ordem: a Etapa 3 depende de `tenants.business_segment`; a Etapa 4 depende das colunas universais e do segmento; a Etapa 5 depende das tabelas e funções de estoque.

## Correções preparadas nesta branch

- Etapa 2: cadastro rejeita explicitamente qualquer segmento informado que não seja `lanchonete` ou `adega`; metadado ausente mantém o padrão retrocompatível `lanchonete`.
- Etapa 5: remoção dos CHECK constraints do ledger limitada aos dois nomes criados pela Etapa 4, sem varrer/remover genericamente constraints adicionais.
- Etapa 5: composição valida embalagem ativa, pertencente ao mesmo tenant e produto, inclusive na gravação persistida.
- Etapa 5: consumo exige chave de idempotência válida; chave reutilizada com combo/quantidade/origem diferentes é rejeitada.
- Etapa 5: chave de idempotência limitada a 120 caracteres para reservar espaço ao sufixo por produto gravado no ledger (limite de 160).

## Pré-condições verificadas no projeto Supabase conectado

- Histórico remoto consultado: última migration registrada `20261126162026`.
- As quatro migrations acima ainda não constam no histórico remoto.
- Tabelas de estoque e composição ainda não existem no schema `public`.
- `tenants.business_segment` ainda não existe.
- As tabelas legadas `tenants`, `products`, `combos`, `sales` e `online_orders` permanecem na estrutura anterior.
- Contagens observadas antes da aplicação: tenants 6; products 17; combos 15; sales 43; online_orders 27.

## Procedimento de publicação

1. Validar o SQL em uma cópia/staging do projeto Supabase com schema e migrations equivalentes à produção.
2. Fazer backup/snapshot antes de qualquer execução no projeto de produção.
3. Executar as quatro migrations na ordem acima, uma por vez, usando o fluxo de migrations versionadas (não executar SQL avulso sem registrar histórico).
4. Após cada migration, verificar sucesso e comparar a estrutura criada com o arquivo versionado.
5. Só depois da Etapa 5, validar o onboarding de uma adega de teste, cadastro de produto, saldo, movimentação, fornecedor/compra, composição de combo e consumo manual do combo.
6. Confirmar que os estabelecimentos antigos continuam com `business_segment = 'lanchonete'` e que os fluxos existentes de lanchonete continuam operando.
7. Não executar a Etapa 6 nesta publicação.

## Consultas de verificação pós-migration

```sql
-- Segmentos e retrocompatibilidade
select business_segment, count(*)
from public.tenants
group by business_segment
order by business_segment;

-- Estruturas adicionadas
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'inventory_balances',
    'inventory_movements',
    'inventory_packaging_conversions',
    'suppliers',
    'product_suppliers',
    'purchase_orders',
    'purchase_order_items',
    'purchase_receipts',
    'purchase_receipt_items',
    'inventory_counts',
    'inventory_count_items',
    'combo_components',
    'combo_consumptions',
    'combo_consumption_items'
  )
order by table_name;

-- RPCs esperadas
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_adega_tenant',
    'inventory_record_movement',
    'inventory_create_purchase_order',
    'inventory_receive_purchase_items',
    'inventory_finalize_count',
    'combo_save_with_composition',
    'combo_check_availability',
    'combo_consume_components'
  )
order by p.proname;

-- Preservação dos dados legados
select
  (select count(*) from public.tenants) as tenants,
  (select count(*) from public.products) as products,
  (select count(*) from public.combos) as combos,
  (select count(*) from public.sales) as sales,
  (select count(*) from public.online_orders) as online_orders;
```

## Estado desta publicação

Este documento e as correções SQL estão preparados para revisão e validação em staging. Nenhuma migration foi executada no projeto Supabase de produção, nenhum dado foi alterado e nenhuma implantação Vercel foi iniciada.
