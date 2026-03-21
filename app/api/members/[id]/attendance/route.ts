import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, queryOne } from '@/lib/db/postgres';

/**
 * GET /api/members/[id]/attendance
 * Retorna estatísticas de presença do membro: total de encontros e frequência por nome de encontro
 * Query: group_id (opcional) — ao visualizar engajamento por grupo (coordenador/admin), informar o group_id para autorizar.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    const { id: memberId } = await params;
    const { searchParams } = new URL(request.url);
    const groupIdParam = searchParams.get('group_id');

    let groupId: string | null = null;

    if (leader?.group_id) {
      groupId = leader.group_id;
    }
    if (groupIdParam && groupId !== groupIdParam) {
      const { getAdminSession } = await import('@/lib/auth/admin-session');
      const admin = await getAdminSession();
      if (admin) {
        groupId = groupIdParam;
      } else if (leader?.role === 'coordinator' && leader.organization_id) {
        const group = await queryOne<{ id: string }>(
          `SELECT id FROM groups WHERE id = $1 AND organization_id = $2`,
          [groupIdParam, leader.organization_id]
        );
        if (group) groupId = groupIdParam;
      }
    }

    if (!groupId) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }

    const member = await queryOne<{ id: string; group_id: string }>(
      `SELECT id, group_id FROM members WHERE id = $1 AND is_active = TRUE`,
      [memberId]
    );
    if (!member || member.group_id !== groupId) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    const totalStats = await queryOne<{ total_meetings: number; present_count: number }>(
      `SELECT
         COUNT(DISTINCT a.meeting_id)::int AS total_meetings,
         COUNT(*) FILTER (WHERE a.is_present = TRUE)::int AS present_count
       FROM attendance a
       JOIN meetings m ON m.id = a.meeting_id
       JOIN members mem ON mem.id = a.member_id
       WHERE a.member_id = $1 AND m.group_id = $2 AND m.is_cancelled = FALSE AND m.meeting_date <= CURRENT_DATE
         AND m.meeting_date >= (mem.created_at AT TIME ZONE 'UTC')::date`,
      [memberId, groupId]
    );

    const byTitle = await queryMany<{
      title: string;
      meeting_count: number;
      present_count: number;
      rate: number;
    }>(
      `WITH meetings_with_title AS (
         SELECT id, TRIM(title) AS title, meeting_date
         FROM meetings
         WHERE group_id = $2 AND is_cancelled = FALSE AND meeting_date <= CURRENT_DATE
           AND title IS NOT NULL AND TRIM(title) <> ''
       ),
       presence_per_meeting AS (
         SELECT mwt.title, mwt.id AS meeting_id,
                (a.member_id IS NOT NULL AND a.is_present) AS was_present
         FROM meetings_with_title mwt
         LEFT JOIN attendance a ON a.meeting_id = mwt.id AND a.member_id = $1
         INNER JOIN members mem ON mem.id = $1
         WHERE mwt.meeting_date >= (mem.created_at AT TIME ZONE 'UTC')::date
       )
       SELECT
         title,
         COUNT(*)::int AS meeting_count,
         COUNT(*) FILTER (WHERE was_present)::int AS present_count,
         CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE was_present) / COUNT(*), 0)::int ELSE 0 END AS rate
       FROM presence_per_meeting
       GROUP BY title
       ORDER BY present_count DESC, meeting_count DESC`,
      [memberId, groupId]
    );

    return NextResponse.json({
      totalMeetings: totalStats?.total_meetings ?? 0,
      totalPresent: totalStats?.present_count ?? 0,
      byTitle: byTitle.map((row) => ({
        title: row.title,
        meetingCount: row.meeting_count,
        presentCount: row.present_count,
        rate: Number(row.rate),
      })),
    });
  } catch (error) {
    console.error('Erro ao buscar presença do membro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
