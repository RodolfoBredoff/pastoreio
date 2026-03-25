import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';

/**
 * GET /api/member-tags/values?keys=chave1,chave2
 * Valores distintos já salvos por chave (no grupo).
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const keysRaw = searchParams.get('keys')?.trim();
    if (!keysRaw) {
      return NextResponse.json({ valuesByKey: {} as Record<string, string[]> });
    }
    const keys = [...new Set(keysRaw.split(',').map((k) => k.trim()).filter(Boolean))].slice(0, 30);
    if (keys.length === 0) {
      return NextResponse.json({ valuesByKey: {} as Record<string, string[]> });
    }

    const rows = await queryMany<{ tag_key: string; tag_value: string }>(
      `SELECT DISTINCT mt.tag_key, mt.tag_value
       FROM member_tags mt
       INNER JOIN members m ON m.id = mt.member_id
       WHERE m.group_id = $1 AND m.is_active = TRUE AND mt.tag_key = ANY($2::text[])
       ORDER BY mt.tag_key ASC, mt.tag_value ASC`,
      [leader.group_id, keys]
    );

    const valuesByKey: Record<string, string[]> = {};
    for (const k of keys) valuesByKey[k] = [];
    for (const r of rows) {
      if (!valuesByKey[r.tag_key]) valuesByKey[r.tag_key] = [];
      const list = valuesByKey[r.tag_key];
      if (!list.includes(r.tag_value)) list.push(r.tag_value);
    }
    return NextResponse.json({ valuesByKey });
  } catch (e) {
    console.error('member-tags/values:', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
