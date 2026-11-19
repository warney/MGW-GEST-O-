self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var data = (event.notification && event.notification.data) || {};
  var targetPath = data.url || '/?view=orders';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url && client.url.indexOf('/cardapio') === -1 && client.url.indexOf('/pedido/') === -1) {
            if ('focus' in client) {
              client.postMessage({
                type: 'MGW_OPEN_ORDERS',
                orderId: data.orderId || null,
              });
              return client.focus();
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetPath);
        }
      }),
  );
});

self.addEventListener('push', function (event) {
  if (!event.data) return;
  var payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Novo pedido no Cardápio Digital!', body: event.data.text() };
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      var hasVisibleAdmin = clients.some(function (client) {
        var isAdminClient = client.url && client.url.indexOf('/cardapio') === -1 && client.url.indexOf('/pedido/') === -1;
        return isAdminClient && client.visibilityState === 'visible';
      });
      if (hasVisibleAdmin) return;

      var targetUrl = typeof payload.url === 'string' && payload.url.charAt(0) === '/'
        ? payload.url
        : '/?view=orders';
      return self.registration.showNotification(payload.title || 'Novo pedido recebido — MGW GESTÃO', {
        body: payload.body || 'Abra a Central de Pedidos para aceitar ou recusar.',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: payload.tag || 'mgw-new-order',
        renotify: true,
        requireInteraction: true,
        vibrate: [250, 120, 250, 120, 350],
        data: { url: targetUrl, orderId: payload.orderId || null },
        actions: [{ action: 'open-orders', title: 'Ver pedidos' }],
      });
    }),
  );
});
