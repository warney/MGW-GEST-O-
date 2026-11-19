# MGW Gestão — Notificações Web Push

## Fluxo
1. O dispositivo autoriza notificações e registra a assinatura Web Push vinculada ao usuário e ao tenant ativo.
2. Um novo pedido do Cardápio Digital é gravado em `online_orders`.
3. O trigger PostgreSQL dispara uma chamada HTTP assíncrona via `pg_net`.
4. A Edge Function valida o segredo compartilhado, consulta o pedido e envia Push somente às assinaturas daquele tenant.
5. O Service Worker mostra o alerta mesmo com o painel fechado. Ao tocar, abre `/?view=orders`.

## Configuração operacional obrigatória
- Supabase Edge Function secrets: `PUSH_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Supabase Vault: criar o segredo `mgw_push_webhook_secret` com o mesmo valor de `PUSH_WEBHOOK_SECRET`.
- A chave pública VAPID está no frontend em `src/services/orderPushNotifications.ts`; a chave privada nunca deve ser colocada no GitHub ou Vercel.
- Aplicar a migration `20261118202000_web_push_order_notifications.sql` e implantar a Edge Function `send-order-push`.

O código da migration não inclui segredo algum. Sem as configurações do Supabase, os pedidos continuam sendo gravados normalmente, mas os Push não serão enviados.

## Compatibilidade
Requer HTTPS, permissão de notificações e assinatura ativa. No iPhone/iPad, instalar o MGW Gestão na Tela de Início (iOS/iPadOS 16.4 ou posterior). O dispositivo deve permitir notificações do aplicativo nas configurações do sistema.
