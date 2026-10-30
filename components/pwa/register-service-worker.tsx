'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker gerado pelo next-pwa (/sw.js).
 * O registro automático do next-pwa v5 é injetado no main.js do Pages Router, que o
 * App Router não carrega; sem isto o service worker nunca é instalado (sem cache
 * offline nem notificações push).
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[PWA] Falha ao registrar o service worker:', err);
    });
  }, []);
  return null;
}
