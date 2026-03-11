import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, queryOne } from '@/lib/db/postgres';

/**
 * GET /api/discipleship
 * Retorna estatísticas de vínculo discipulador–discípulo do grupo.
 * Query: group_id (opcional, para coordenador/admin) ou public_token (para página pública).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupIdParam = searchParams.get('group_id');
    const publicToken = searchParams.get('public_token')?.trim() || null;

    let groupId: string | null = null;

    if (publicToken) {
      const group = await queryOne<{ id: string }>(
        `SELECT id FROM groups WHERE engagement_share_token = $1 AND engagement_share_enabled = TRUE`,
        [publicToken]
      );
      if (!group) {
        return NextResponse.json({ error: 'Link inválido ou desativado' }, { status: 404 });
      }
      groupId = group.id;
    } else {
      await requireAuth();
      const leader = await getCurrentLeader();
      groupId = leader?.group_id ?? null;

      if (leader?.role === 'coordinator' && groupIdParam) {
        const group = await queryOne<{ id: string }>(
          `SELECT id FROM groups WHERE id = $1 AND organization_id = $2`,
          [groupIdParam, leader.organization_id]
        );
        if (group) groupId = groupIdParam;
      } else if (groupIdParam) {
        const { getAdminSession } = await import('@/lib/auth/admin-session');
        if (await getAdminSession()) groupId = groupIdParam;
      }
    }

    if (!groupId) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 400 });
    }

    const members = await queryMany<{
      id: string;
      full_name: string;
      discipulador_id: string | null;
      discipulador_name: string | null;
    }>(
      `SELECT m.id, m.full_name, m.discipulador_id,
              d.full_name AS discipulador_name
       FROM members m
       LEFT JOIN members d ON d.id = m.discipulador_id
       WHERE m.group_id = $1 AND m.is_active = TRUE`,
      [groupId]
    );

    const totalMembers = members.length;
    const linked = members.filter((m) => m.discipulador_id != null);
    const totalLinked = linked.length;

    const byDiscipulador = new Map<string, {
      discipuladorId: string;
      discipuladorName: string;
      count: number;
      members: { id: string; full_name: string }[];
    }>();
    for (const m of linked) {
      if (!m.discipulador_id) continue;
      const key = m.discipulador_id;
      if (!byDiscipulador.has(key)) {
        byDiscipulador.set(key, {
          discipuladorId: m.discipulador_id,
          discipuladorName: m.discipulador_name ?? 'Sem nome',
          count: 0,
          members: [],
        });
      }
      const entry = byDiscipulador.get(key)!;
      entry.count++;
      entry.members.push({ id: m.id, full_name: m.full_name });
    }

    const byDiscipuladorList = Array.from(byDiscipulador.values())
      .sort((a, b) => b.count - a.count)
      .map((d) => ({ ...d, members: d.members.sort((a, b) => a.full_name.localeCompare(b.full_name)) }));

    return NextResponse.json({
      totalMembers,
      totalLinked,
      totalUnlinked: totalMembers - totalLinked,
      byDiscipulador: byDiscipuladorList,
    });
  } catch (error) {
    console.error('Erro ao buscar dados de discipulado:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
