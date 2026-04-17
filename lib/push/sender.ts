/**
 * Módulo de envio de notificações push via Web Push API (VAPID).
 * Requer as seguintes variáveis de ambiente:
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   - VAPID_PRIVATE_KEY
 *   - VAPID_SUBJECT (ex: mailto:admin@seudominio.com)
 *
 * Gerar chaves: npx web-push generate-vapid-keys
 * Salvar em SSM:
 *   /pequenos-grupos/push/vapid_public_key  (String)
 *   /pequenos-grupos/push/vapid_private_key (SecureString)
 */

interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

/**
 * Envia notificação push para uma lista de subscriptions.
 * Retorna os endpoints que falharam (para remoção do banco).
 */
export async function sendPushNotification(
  subscriptions: PushSubscriptionData[],
  payload: PushPayload
): Promise<{ failedEndpoints: string[] }> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@pequenos-grupos.com';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('[Push] VAPID keys não configuradas. Notificações push desabilitadas.');
    return { failedEndpoints: [] };
  }

  const webpush = await import('web-push');
  webpush.default.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const payloadStr = JSON.stringify(payload);
  const failedEndpoints: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.default.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expirada ou inválida — remover do banco
          failedEndpoints.push(sub.endpoint);
        } else {
          console.error('[Push] Erro ao enviar para', sub.endpoint, err);
        }
      }
    })
  );

  return { failedEndpoints };
}

/**
 * Busca subscriptions de push de um líder no banco e envia notificação.
 */
export async function sendPushToLeader(
  leaderId: string,
  payload: PushPayload
): Promise<void> {
  try {
    const { queryMany, query } = await import('@/lib/db/postgres');

    const subs = await queryMany<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE leader_id = $1`,
      [leaderId]
    );

    if (subs.length === 0) return;

    const { failedEndpoints } = await sendPushNotification(subs, payload);

    if (failedEndpoints.length > 0) {
      await query(
        `DELETE FROM push_subscriptions WHERE endpoint = ANY($1)`,
        [failedEndpoints]
      );
    }
  } catch (err) {
    console.error('[Push] Erro ao enviar para líder', leaderId, err);
  }
}
