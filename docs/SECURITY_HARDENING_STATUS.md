# MGW — status das correções de segurança

Branch de trabalho: `fix/security-hardening-2026-11`

## Alterações preparadas nesta branch

- Webhook do Mercado Pago: eventos de pré-aprovação podem ser reprocessados após falha; o registro do evento volta a `received` e limpa o erro anterior antes de aplicar novamente o estado confirmado pela API do provedor.
- Webhook do Mercado Pago: estados desconhecidos deixam de ser convertidos silenciosamente para `pending`; são registrados como falha e respondidos como não suportados.
- RLS de `product_addon_groups`: as verificações de tenant agora qualificam explicitamente `product_addon_groups.tenant_id`, evitando comparações tautológicas no UPDATE.
- Função de trigger `guard_mgw_menu_addon_tenant`: execução direta por `PUBLIC`, `anon` e `authenticated` revogada; a função permanece associada aos triggers.
- Retenção de assinaturas: migration preparada para sincronizar `ended_at`, `retention_until`, `retention_started_at`, `retention_ends_at` e `retention_status`.
- A RPC de acompanhamento de pedido é ajustada para não devolver o hash interno do token.
- Diagnóstico de migration pendente do painel administrativo atualizado para reconhecer os identificadores de migration encontrados no histórico remoto.
- CI passa a executar lint, testes e build do app administrativo além do app principal.
- `backups/` adicionado ao `.gitignore` para evitar inclusão acidental de novos arquivos locais de backup.

## Pendências que impedem declarar o sistema pronto para produção

1. **Rate limit / CAPTCHA de pedidos públicos:** a RPC `create_public_online_order` continua acessível anonimamente e aceita chamadas diretas ao PostgREST. A validação de carrinho e preços no banco não impede pedidos automatizados em massa. A proteção adequada exige colocar a criação atrás de uma camada confiável com rate limit por IP e/ou CAPTCHA (por exemplo, Turnstile), além de restringir a execução direta da RPC. Não foi implementada uma proteção falsa baseada em IP enviado livremente pelo cliente.
2. **Drift de migrations:** o histórico remoto e os arquivos versionados continuam divergentes. Os arquivos ausentes no repositório precisam ser recuperados ou reconstruídos e comparados com o schema real antes de executar qualquer migration. A migration nova desta branch está apenas no Git.
3. **Edge Functions divergentes:** `menu-storage` e `send-order-push` têm versões implantadas diferentes do código versionado. O código versionado contém controles mais recentes, mas não foi implantado.
4. **Mercado Pago:** integração permanece configurada para credenciais de teste. Não houve cobrança real nem teste de webhook com pagamento real.
5. **Backup legado público:** o arquivo histórico em `backups/` continua no repositório e no histórico Git. O ignore impede novos arquivos não rastreados, mas não remove o arquivo existente nem o histórico. A remoção do histórico requer operação separada e coordenada.
6. **Validação operacional:** testes adversariais entre tenants, pedidos em volume, fluxo real de push em PWA e ciclo completo de assinatura/pagamento ainda precisam ser executados em ambiente de homologação.

## Segurança de publicação

Esta branch não altera `main`, não aplica migrations no banco de produção e não faz deploy manual de Edge Functions ou Vercel. Não publicar nem aplicar migrations até concluir o drift e executar a homologação.
