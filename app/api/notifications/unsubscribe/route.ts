import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query } from '@/lib/db/postgres';

/**
 * DELETE /api/notifications/unsubscribe
 * Remove a subscription de push notification do líder.
 */
export async function DELETE(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint é obrigatório' }, { status: 400 });
    }

    await query(
      `DELETE FROM push_subscriptions WHERE leader_id = $1 AND endpoint = $2`,
      [leader.id, endpoint]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover subscription:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
