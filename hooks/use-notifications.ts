'use client';

import { useCallback, useEffect, useState } from 'react';

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** serviceWorker.ready nunca resolve se não houver service worker: limita a espera. */
function swReady(ms = 10000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('service worker indisponível')), ms)),
  ]);
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  // Estado real: a inscrição que já existe neste aparelho (não só a permissão)
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
    setIsSupported(supported);
    if (!supported) return;
    setPermission(Notification.permission);
    swReady()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setSubscription(sub);
        // Reenvia ao servidor (renova o vínculo com o usuário logado)
        if (sub) {
          fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      const keyRes = await fetch('/api/notifications/vapid-public-key', { cache: 'no-store' });
      if (!keyRes.ok) {
        console.warn('[Push] Notificações não configuradas no servidor');
        return false;
      }
      const { key } = (await keyRes.json()) as { key: string };

      const registration = await swReady();
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(key),
        }));

      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      if (!res.ok) return false;
      setSubscription(sub);
      return true;
    } catch (error) {
      console.error('Erro ao ativar notificações:', error);
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    try {
      if (!subscription) return;
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      setSubscription(null);
      await fetch('/api/notifications/unsubscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
    } catch (error) {
      console.error('Erro ao cancelar inscrição:', error);
    }
  }, [subscription]);

  return { permission, subscription, requestPermission, unsubscribe, isSupported };
}
