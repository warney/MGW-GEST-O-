# Migração Firebase → Supabase — Plano de execução controlada

## Estado atual (auditoria em 2026-11-18)

- Branch isolada: `migration/supabase-auth-transition`, criada a partir de `main`.
- Produção permanece no Firebase; nenhum commit foi feito em `main`.
- Projeto Supabase conectado: `rlinibriiwbkdqjrfapd`, região `us-west-2`, estado `ACTIVE_HEALTHY`.
- O schema `public` está sem tabelas de aplicação e `auth.users` está vazio.
- A única migration registrada no Supabase é `20261118181604 supabase_storage_mgw_cardapios`.
- Bucket `mgw-cardapios` existe; limite 2 MiB; MIME permitidos WebP/JPEG/PNG.
- Edge Function `menu-storage` está ativa com `verify_jwt=false` e valida atualmente JWT Firebase. A transição deve substituir essa validação por Supabase Auth antes de ativar o novo login.
- O frontend já contém caminhos parciais de Supabase Auth, mas `dataService.ts` e `storageService.ts` ainda integram diretamente Firebase Auth/Firestore.
- O código documenta 3 contas em 2 tenants: duas contas em `mgw_lanches` e uma em `gf_lanches`.

## Bloqueio de segurança

O backup versionado atual protege código, não dados. O documento `BACKUP_MGW_GESTAO.md` registra que ainda não havia exportação integral do Firestore nem exportação do Firebase Authentication. Não iniciar ETL, criar usuários Supabase definitivos, alterar provedor de produção ou desligar Firebase até receber e validar:
1. Exportação completa do Firestore, incluindo settings, products, combos, sales, expenses e workspaces, preservando o banco nomeado de origem.
2. Exportação das contas Firebase Authentication e confirmação dos três e-mails/UIDs, provider data e estado de verificação.
3. Inventário/backup de imagens e metadados de Storage, incluindo URLs e paths usados no catálogo.
4. Hashes e contagens verificáveis dos arquivos de backup, guardados fora do GitHub e sem publicar dados pessoais/secrets.

## Fases

### Fase 0 — Preparação e rollback (em andamento)
- [x] Criar branch isolada.
- [x] Auditar estado do projeto Supabase sem modificar dados.
- [x] Confirmar que o bucket de imagens existe.
- [ ] Obter e validar exportações de Firestore, Firebase Auth e Storage.
- [ ] Confirmar mapeamento dos 3 usuários para os 2 tenants.

### Fase 1 — Schema PostgreSQL e RLS (somente após backup)
- Revisar as migrations existentes em ordem, reconciliando-as com o estado real do projeto.
- Aplicar primeiro em ambiente de desenvolvimento isolado; não aplicar SQL em produção durante esta fase.
- Testar RLS com usuários de cada tenant, incluindo tentativas de leitura/escrita cruzada.
- Não confiar em email/user_metadata do cliente como fonte de autorização.

### Fase 2 — Migração de identidade
- Importar usuários para Supabase Auth com IDs/mapeamento auditável quando tecnicamente suportado.
- Preservar e-mails verificados e provedores; validar login Google/OAuth e recuperação de senha.
- Não armazenar nem transportar senhas em texto puro. Se hashes Firebase não forem compatíveis com importação direta, usar fluxo seguro de redefinição/reativação sem apagar a identidade de origem prematuramente.
- Criar vínculo `tenant_members` para as três contas existentes e testar acesso.

### Fase 3 — Migração de dados
- Executar ETL em dry-run; depois importar em lotes idempotentes.
- Preservar IDs legados como chaves de origem e snapshots históricos.
- Comparar registro a registro, contagens, somas financeiras e referências entre tabelas.
- Interromper em qualquer órfão, data inválida ou divergência.

### Fase 4 — Aplicação e Storage
- Trocar autenticação de cada serviço sem alterar contratos/funcionalidades de UI.
- Atualizar `menu-storage` para verificar JWT Supabase e autorizar por `tenant_members`/RLS; manter o caminho antigo somente durante janela de rollback controlada.
- Testar logo, banner, fotos, cardápio público, pedidos, rastreamento e operações administrativas.

### Fase 5 — Homologação e ativação
- Rodar typecheck, testes, build, testes E2E e matriz de isolamento.
- Homologar em deployment Preview Vercel e ambiente Supabase de desenvolvimento.
- Fazer cutover com janela de manutenção curta e plano de retorno; manter Firebase íntegro e disponível durante o período de observação.
- Desativar Firebase apenas após aprovação expressa e estabilidade confirmada.

## Regras invioláveis

- Não alterar `main`, produção, banco Firebase, regras ou usuários durante preparação.
- Não aplicar migrations no Supabase de produção sem revisão e autorização específica da etapa de cutover.
- Não inserir secrets no repositório, frontend, chat ou logs.
- Não apagar usuários, documentos ou arquivos de origem durante migração.
- Não declarar migração concluída com base apenas em totais agregados.
