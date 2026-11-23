# Auditoria de reconciliacao de migrations — MGW Gestao

Data da verificacao: 2026-11-22/23
Projeto Supabase: rlinibriiwbkdqjrfapd
Branch-base: main @ 04353cfd41f3920d9b6399fb91647c73e0aab7ec

## Escopo e seguranca

Esta auditoria foi somente de leitura. Nenhuma migration foi aplicada, nenhuma tabela/policy/function foi alterada e nenhum dado foi atualizado no Supabase remoto. Nenhum deploy foi iniciado.

## Resultado do historico

O historico remoto retorna 19 migrations. O diretorio `supabase/migrations` da `main` nao representa integralmente esse historico.

Divergencias confirmadas:

1. Remoto: `20261122171114_mgw_admin_schema_compatibility_prerequisites`.
   - Fonte encontrada em `fix/mgw-admin-migration-compat`.
   - Ausente da `main`.

2. Remoto: `20261122171122_etapa4_1_platform_admin_security_and_audit`.
   - Fonte com esse timestamp encontrada em `fix/mgw-admin-migration-compat`.
   - A `main` tem uma fonte anterior/diferente: `20261122000001_etapa4_1_platform_admin_security_and_audit.sql`.
   - Nao tratar os dois arquivos como equivalentes sem comparar o conteudo completo e os objetos efetivamente criados.

3. Remoto:
   - `20261122184839_custom_menu_categories_and_addon_groups`
   - `20261122184923_public_menu_addon_validation_and_order_snapshots`
   - `20261122185413_validate_only_active_product_addon_groups`
   As fontes exatas nao foram encontradas na `main`, `fix/mgw-admin-migration-compat`, `feat/menu-categories-addons` ou `design/mgw-admin-redesign`.

4. A `main` contem `20261122143000_custom_menu_categories_and_addon_groups.sql`, mas esse timestamp nao aparece no historico remoto. O schema remoto contem as tabelas e policies de categorias/adicionais, mas isso nao prova que o arquivo de timestamp 22143000 seja o SQL exato aplicado no remoto.

5. A migration `20261122172733_mgw_admin_phase_4_4_billing_integrity` existe na `main` e no historico remoto.

## Estado observado no banco

- Tabelas `product_categories`, `addon_groups`, `addon_options` e `product_addon_groups` existem.
- As quatro tabelas estao com RLS habilitado e possuem policies de tenant/role.
- `online_order_items.selected_addons` e usado pelo fluxo de pedidos; a funcao publica de criacao de pedido resolve os adicionais e grava snapshots.
- A funcao `get_public_digital_menu` devolve grupos/opcoes ativos.
- A funcao `resolve_public_product_addons` valida grupos vinculados, limites de selecao e opcoes ativas.

## Inconsistencia de policy para corrigir em uma migration futura

A policy `product_addon_groups_manager_update` tem um `WITH CHECK` no qual as condicoes comparativas aparecem como:

- `p.tenant_id = p.tenant_id`
- `g.tenant_id = g.tenant_id`

Essas comparacoes sao tautologicas e nao verificam o tenant do registro que esta sendo gravado. O trigger `trg_guard_product_addon_group_tenant` tambem valida os vinculos no banco, reduzindo o risco atual, mas a policy deve ser corrigida para expressar a mesma regra de forma independente e legivel. A funcao `guard_mgw_menu_addon_tenant()` tambem deve ter seus grants de EXECUTE revisados, pois e uma funcao SECURITY DEFINER usada por triggers, nao um endpoint publico.

## Decisao tecnica

Nao foram criados arquivos de migration historicos ficticios nem migrations vazias. O catalogo atual permite recuperar definicoes de funcoes, policies, triggers e colunas, mas nao permite provar a ordem e o SQL integral de cada uma das tres migrations remotas ausentes. Recriar esses arquivos como se fossem as fontes originais poderia mascarar drift e causar confusao em futuras implantacoes.

## Proximas acoes seguras

1. Recuperar o SQL original das tres migrations remotas ausentes a partir do historico de execucao/backup/autoria, ou aprovar explicitamente um baseline de schema reconstruido a partir do catalogo.
2. Comparar integralmente a migration remota 22171122 com a fonte atual da main e consolidar uma unica fonte correta.
3. Criar uma migration NOVA e forward-only para corrigir a policy `product_addon_groups_manager_update` e revisar grants da funcao de trigger, apos testes em ambiente isolado.
4. Somente depois de validar a correspondencia entre fonte e banco, atualizar a trilha versionada do repositorio. Nao reaplicar migrations ja registradas no remoto.
