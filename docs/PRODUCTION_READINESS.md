# MGW GESTAO — Revisao de prontidao para producao

Branch de trabalho: `codex/mgw-production-readiness`

## Limites desta etapa

- Nenhuma migration foi executada no Supabase.
- Nenhuma variavel da Vercel foi criada ou alterada.
- Nenhum deploy foi iniciado manualmente.
- Nenhuma alteracao foi feita na branch `main`.
- Nenhum dado de producao foi alterado.

## Correcao preparada nesta branch

Foi adicionada a migration:

`supabase/migrations/20261118000001_harden_online_order_status_writes.sql`

A migration remove o privilegio SQL `UPDATE` direto de `authenticated` em `public.online_orders` e remove a policy de UPDATE direto. O fluxo administrativo existente usa a RPC `transition_online_order_status()`, que valida autenticacao, papel do usuario no tenant, transicoes permitidas, motivo de recusa/cancelamento, historico e criacao idempotente da venda ao concluir.

A migration inclui uma verificacao defensiva e aborta a transacao se a role `authenticated` ainda tiver privilegio UPDATE. Ela nao apaga nem atualiza registros.

## Bloqueadores antes da producao

1. **Validar a cadeia de migrations 001–003 em um projeto Supabase de teste.** O projeto de producao informado ainda nao tem tabelas de aplicacao nem historico de migrations; portanto, nao se deve aplicar somente a migration 003 ou 004.
2. **Migracao de dados Firebase → Supabase.** Executar primeiro `--dry-run` e `--verify-only`; conferir os tenants MGW e GF separadamente e decidir explicitamente quais dados devem ser transferidos. Nao mudar o provider antes da paridade.
3. **Taxa por bairro ainda nao esta implementada.** O esquema e a RPC atuais usam uma taxa unica `digital_menu_settings.delivery_fee`. A decisao funcional e cobrar por bairro exige tabela de areas de entrega, campo de bairro no checkout, retorno das areas no cardapio publico e calculo autoritativo da taxa na RPC do banco. Nao ativar cobranca por bairro enquanto esses pontos nao estiverem implementados e testados.
4. **Variaveis da Vercel ainda nao foram configuradas.** Confirmar os nomes e valores com o projeto Supabase e configurar primeiro num ambiente Preview/QA. O provider atual deve continuar no Firebase ate a validacao completa.
5. **Revisar a funcao de evento `public.rls_auto_enable()`.** O alerta de funcao SECURITY DEFINER executavel publicamente precisa de investigacao da origem, owner, grants e event trigger no projeto de teste. Nao alterar a funcao automaticamente sem confirmar quem a criou e o que depende dela.
6. **Testar Realtime e exposicao de dados.** A migration 003 adiciona varias tabelas a publicacao Realtime. Confirmar que clientes anonimos so conseguem ler os pings sem PII e que usuarios autenticados ficam limitados ao tenant por RLS.
7. **Validar o deploy e o build.** O repositório atualmente declara `build: vite build` e `lint: tsc --noEmit`; nao ha script `test` declarado em `package.json`. Preparar e executar verificacoes automatizadas em ambiente controlado antes do merge.

## Sequencia recomendada

1. Criar um projeto Supabase de QA ou branch de banco isolada.
2. Aplicar migrations 001, 002 e 003 na ordem, corrigindo erros antes de prosseguir.
3. Aplicar a migration 004 desta branch em QA e comprovar que a RPC continua atualizando status e criando somente uma venda ao concluir.
4. Implementar e testar a taxa por bairro de ponta a ponta (UI + RPC + persistencia).
5. Executar dry-run e verificacao de paridade dos dados Firebase.
6. Configurar Preview da Vercel e validar login, produtos, combos, vendas, despesas, pedidos, tracking, retirada e entrega.
7. Somente apos aprovacao explicita, planejar janela de migracao e ativacao de producao.

## Validacao pendente

Esta branch ainda nao deve ser considerada pronta para merge ou producao. A migration 004 foi revisada estaticamente, mas ainda precisa ser executada e testada em QA com as migrations anteriores.
