import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query } from '@/lib/db/postgres';

/**
 * POST /api/notifications/subscribe
 * Salva uma subscription de push notification para o líder autenticado.
 */
export async function POST(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'Dados de subscription inválidos' },
        { status: 400 }
      );
    }

    await query(
      `INSERT INTO push_subscriptions (leader_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET
         leader_id = EXCLUDED.leader_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth`,
      [leader.id, endpoint, keys.p256dh, keys.auth]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro ao salvar subscription:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
