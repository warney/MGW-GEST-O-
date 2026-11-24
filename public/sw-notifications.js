function isPublicOrAuthPath(urlString) {
  if (!urlString) return true;
  try {
    var parsed = new URL(urlString);
    var pathname = parsed.pathname || '/';
    if (
      pathname.indexOf('/cardapio') === 0 ||
      pathname.indexOf('/pedido/') === 0 ||
      pathname.indexOf('/login') === 0 ||
      pathname.indexOf('/cadastro') === 0 ||
      pathname.indexOf('/termos') === 0 ||
      pathname.indexOf('/privacidade') === 0
    ) {
      return true;
    }
    return false;
  } catch (e) {
    return (
      urlString.indexOf('/cardapio') !== -1 ||
      urlString.indexOf('/pedido/') !== -1 ||
      urlString.indexOf('/login') !== -1 ||
      urlString.indexOf('/cadastro') !== -1
    );
  }
}

function resolveTargetOrderUrl(rawUrl) {
  if (typeof rawUrl === 'string' && rawUrl.charAt(0) === '/') {
    return rawUrl;
  }
  return '/?view=orders';
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var data = (event.notification && event.notification.data) || {};
  var targetPath = resolveTargetOrderUrl(data.url);
  var targetAbsoluteUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (!isPublicOrAuthPath(client.url) && 'focus' in client) {
            client.postMessage({
              type: 'MGW_OPEN_ORDERS',
              orderId: data.orderId || null,
              tenantId: data.tenantId || null,
            });
            try {
              var currentPath = new URL(client.url).pathname;
              if (currentPath !== '/' && 'navigate' in client) {
                return client.navigate(targetAbsoluteUrl).then(function (navigated) {
                  return (navigated || client).focus();
                }).catch(function () {
                  return client.focus();
                });
              }
            } catch (e) {
              // Ignora erro de URL
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetAbsoluteUrl);
        }
      }),
  );
});

self.addEventListener('push', function (event) {
  var payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = {
        title: '🔔 NOVO PEDIDO RECEBIDO!',
        body: event.data.text(),
      };
    }
  }

  var targetUrl = resolveTargetOrderUrl(payload.url);
  var orderTag =
    payload.tag ||
    (payload.orderId ? 'mgw-order-' + payload.orderId : 'mgw-new-order');
  var title = payload.title || '🔔 NOVO PEDIDO RECEBIDO!';
  var body =
    payload.body ||
    'Você recebeu um novo pedido no MGW Gestão. Toque para ver detalhes.';
  var timestamp =
    typeof payload.timestamp === 'number' && isFinite(payload.timestamp)
      ? payload.timestamp
      : Date.now();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: orderTag,
        renotify: true,
        requireInteraction: true,
        silent: false,
        timestamp: timestamp,
        vibrate: [300, 120, 300, 120, 450],
        data: {
          url: targetUrl,
          orderId: payload.orderId || null,
          tenantId: payload.tenantId || null,
          kind: payload.kind || 'new_order',
        },
        actions: [{ action: 'open-orders', title: 'Ver pedido agora' }],
      }),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then(function (clients) {
          for (var i = 0; i < clients.length; i++) {
            var client = clients[i];
            if (!isPublicOrAuthPath(client.url)) {
              client.postMessage({
                type: 'MGW_NEW_ORDER_PUSH',
                orderId: payload.orderId || null,
                tenantId: payload.tenantId || null,
                kind: payload.kind || 'new_order',
              });
            }
          }
        })
        .catch(function () {
          // Ignora erro de postMessage para clients
        }),
    ]),
  );
});

self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    (function () {
      var applicationServerKey =
        event.oldSubscription &&
        event.oldSubscription.options &&
        event.oldSubscription.options.applicationServerKey;
      var subscribePromise = applicationServerKey
        ? self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey,
          })
        : Promise.resolve(null);

      return subscribePromise
        .then(function (newSub) {
          return self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (clients) {
              var serialized = newSub ? newSub.toJSON() : null;
              for (var i = 0; i < clients.length; i++) {
                var client = clients[i];
                if (!isPublicOrAuthPath(client.url)) {
                  client.postMessage({
                    type: 'MGW_PUSH_SUBSCRIPTION_CHANGED',
                    oldEndpoint: event.oldSubscription
                      ? event.oldSubscription.endpoint
                      : null,
                    subscription: serialized,
                  });
                }
              }
            });
        })
        .catch(function () {
          // Re-sincronizacao acontecera automaticamente ao reabrir o painel
        });
    })(),
  );
});
