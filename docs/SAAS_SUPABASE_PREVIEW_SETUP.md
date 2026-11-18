# MGW Gestão — validação do SaaS Supabase no Preview

Este guia é exclusivo para preparar a validação da branch `feat/saas-supabase-auth`.
**Não altere as variáveis do ambiente Production da Vercel nesta fase.**

## 1. Variáveis somente no Preview da Vercel

Configure em Project Settings → Environment Variables, selecionando somente **Preview**:

- `VITE_DATA_PROVIDER=supabase`
- `VITE_SUPABASE_URL=https://rlinibriiwbkdqjrfapd.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: use a chave publicável (Publishable key) do projeto Supabase.

Não configure `SUPABASE_SERVICE_ROLE_KEY` com prefixo `VITE_` e nunca exponha a chave secreta no navegador.

## 2. Supabase Auth

Depois que as migrations forem aplicadas ao projeto de validação:

- habilite confirmação de e-mail;
- configure Site URL e Redirect URLs para o domínio Preview exato da Vercel;
- configure também a URL de recuperação de senha;
- configure SMTP de produção antes de liberar cadastro público para usuários reais (o serviço padrão de e-mail tem limites).

## 3. Banco e Storage

A ordem prevista de migrations é:

1. `20261114000001_initial_saas_schema.sql`
2. `20261118000001_supabase_storage_mgw_cardapios.sql` (o bucket já existe no projeto atual; não recriar manualmente)
3. `20261119000001_saas_signup_and_digital_menu.sql`

A Edge Function `menu-storage` deve ser publicada depois de configurar os secrets gerenciados pelo Supabase. Ela valida o access token Supabase e confirma a associação ativa do usuário ao tenant solicitado.

## 4. Critérios de aprovação

- Criar conta com e-mail A e estabelecimento A; confirmar e-mail; entrar; criar produto.
- Criar conta com e-mail B e estabelecimento B; confirmar e-mail; entrar.
- Confirmar que B não consegue consultar, editar, excluir ou obter URL privada de arquivos de A.
- Confirmar que A não acessa os dados de B.
- Testar recuperação de senha, upload/exclusão de logo, banner, produto e combo.
- Testar painel financeiro e o cardápio público.
- Testar pedidos online e rastreamento após concluir as RPCs/tabelas específicas de pedidos.

**Bloqueio atual:** o fluxo de cadastro/provisionamento e a leitura pública do cardápio estão preparados nesta fase, mas a camada Supabase de pedidos online e rastreamento ainda precisa ser concluída. Não considerar o sistema pronto para operação comercial até esses testes passarem.

## Rollback

Enquanto a branch estiver em Preview, Production continua com suas variáveis atuais e Firebase permanece intacto. Para interromper o teste, basta não promover/mesclar a branch e remover as variáveis do ambiente Preview. Não apagar usuários, tabelas ou arquivos para fazer rollback.
