# MGW Gestão — Notificações Web Push

## Fluxo
1. O dispositivo autoriza notificações e registra a assinatura Web Push vinculada ao usuário e ao estabelecimento ativo (`tenant_push_subscriptions`), mantendo múltiplos dispositivos por usuário (celular + computador).
2. Um novo pedido do Cardápio Digital é gravado em `online_orders` (`status = 'received'`).
3. O trigger PostgreSQL `online_orders_dispatch_push` dispara uma chamada HTTP assíncrona via `pg_net` (timeout de 10s) e registra log inicial em `order_push_delivery_logs`.
4. A Edge Function `send-order-push` valida o segredo compartilhado (`PUSH_WEBHOOK_SECRET`), evita duplicidade por `order_id`, filtra apenas assinaturas ativas de membros autorizados (`owner`, `admin`, `manager`) do estabelecimento do pedido e envia o Web Push com `TTL: 3600` e `urgency: 'high'`.
5. O Service Worker (`sw-notifications.js` embutido no `sw.js`) exibe a notificação via `showNotification()` mesmo com o painel em segundo plano ou fechado, e lida com renovação automática de assinatura (`pushsubscriptionchange`). Ao tocar, abre `/?view=orders`.

## Configuração operacional obrigatória no Supabase
- **Edge Function secrets** (`send-order-push`): `PUSH_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (ex: `mailto:suporte@mgwgestao.com.br`).
- **Supabase Vault**: criar o segredo `mgw_push_webhook_secret` com o mesmo valor exato de `PUSH_WEBHOOK_SECRET`.
- **Chave pública VAPID**: configurada no frontend em `src/services/orderPushNotifications.ts` (`VAPID_PUBLIC_KEY`). Ela deve corresponder exatamente à `VAPID_PUBLIC_KEY` (e ao par `VAPID_PRIVATE_KEY`) das secrets da Edge Function.
- **Migrations**: aplicar `20261118202000_web_push_order_notifications.sql` e `20261124120000_web_push_reliability_and_logs.sql`.
- **Edge Function**: implantar a versão atualizada de `send-order-push` (com suporte a deduplicação, RBAC, `diagnose` e `test` autenticado).

O pedido nunca deixa de ser salvo caso o envio Push falhe; falhas e status de entrega ficam registrados em `order_push_delivery_logs`.

## Compatibilidade
- Requer HTTPS, permissão de notificações concedida pelo usuário e Service Worker ativo.
- **Android (Chrome / PWA instalada):** suporte completo em primeiro plano, segundo plano e navegador fechado.
- **Computadores (Windows / macOS — Chrome, Edge, Firefox, Safari 16+):** suporte completo; em segundo plano ou fechado depende de o navegador/serviço de notificações do SO estar habilitado.
- **iPhone / iPad (iOS/iPadOS 16.4+):** requer instalar o MGW Gestão na **Tela de Início** pelo Safari e abrir o app pelo ícone instalado para permitir Web Push.
