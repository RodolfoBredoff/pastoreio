import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';

/**
 * GET /api/member-tags/keys
 * Lista todas as chaves de tag já usadas no grupo (ativas).
 */
export async function GET() {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }

    const rows = await queryMany<{ tag_key: string }>(
      `SELECT DISTINCT mt.tag_key
       FROM member_tags mt
       INNER JOIN members m ON m.id = mt.member_id
       WHERE m.group_id = $1 AND m.is_active = TRUE
       ORDER BY mt.tag_key ASC`,
      [leader.group_id]
    );
    return NextResponse.json({ keys: rows.map((r) => r.tag_key) });
  } catch (e) {
    console.error('member-tags/keys:', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
