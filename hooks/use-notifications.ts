'use client';

import { useEffect, useState } from 'react';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      console.error('Este navegador não suporta notificações');
      return false;
    }

    if (!('serviceWorker' in navigator)) {
      console.error('Este navegador não suporta Service Workers');
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        
        // Check if push manager is available
        if (!registration.pushManager) {
          console.error('Push Manager não disponível');
          return false;
        }

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          console.warn('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY não configurada');
          return false;
        }

        // Subscribe to push notifications
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });

        setSubscription(sub);

        // Send subscription to backend
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Erro ao solicitar permissão de notificação:', error);
      return false;
    }
  };

  const unsubscribe = async () => {
    try {
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        setSubscription(null);
        
        // Remove subscription from backend
        await fetch('/api/notifications/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }
    } catch (error) {
      console.error('Erro ao cancelar inscrição:', error);
    }
  };

  return { 
    permission, 
    subscription,
    requestPermission,
    unsubscribe,
    isSupported: 'Notification' in window && 'serviceWorker' in navigator
  };
}
