import { NextResponse } from 'next/server';
import { requireCoordinator } from '@/lib/auth/coordinator-session';
import { queryMany } from '@/lib/db/postgres';

export interface GroupComparisonRow {
  id: string;
  name: string;
  member_count: number;
  visitor_count: number;
  avg_attendance_rate: number;
  last_meeting_date: string | null;
  total_meetings: number;
}

/**
 * GET /api/coordinator/groups/comparison
 * Retorna comparativo de desempenho entre todos os grupos da organização.
 */
export async function GET() {
  try {
    const coordinator = await requireCoordinator();

    const rows = await queryMany<{
      id: string;
      name: string;
      member_count: string;
      visitor_count: string;
      avg_attendance_rate: string;
      last_meeting_date: string | null;
      total_meetings: string;
    }>(
      `SELECT
         g.id,
         g.name,
         COUNT(DISTINCT m.id) FILTER (WHERE m.is_active = TRUE AND m.member_type = 'participant') AS member_count,
         COUNT(DISTINCT m.id) FILTER (WHERE m.is_active = TRUE AND m.member_type = 'visitor') AS visitor_count,
         COALESCE(ROUND(AVG(meeting_stats.taxa)::numeric, 1), 0) AS avg_attendance_rate,
         MAX(mt.meeting_date) AS last_meeting_date,
         COUNT(DISTINCT mt.id) FILTER (WHERE mt.is_cancelled = FALSE) AS total_meetings
       FROM groups g
       LEFT JOIN members m ON m.group_id = g.id
       LEFT JOIN meetings mt ON mt.group_id = g.id AND mt.is_cancelled = FALSE
       LEFT JOIN LATERAL (
         SELECT
           mt2.id,
           CASE
             WHEN COUNT(a.id) = 0 THEN 0
             ELSE ROUND(
               100.0 * COUNT(a.id) FILTER (WHERE a.is_present = TRUE) / NULLIF(COUNT(a.id), 0),
               1
             )
           END AS taxa
         FROM meetings mt2
         LEFT JOIN attendance a ON a.meeting_id = mt2.id
         WHERE mt2.group_id = g.id AND mt2.is_cancelled = FALSE
           AND mt2.meeting_date >= CURRENT_DATE - INTERVAL '90 days'
         GROUP BY mt2.id
       ) meeting_stats ON TRUE
       WHERE g.organization_id = $1
       GROUP BY g.id, g.name
       ORDER BY avg_attendance_rate DESC, member_count DESC`,
      [coordinator.organization_id]
    );

    const result: GroupComparisonRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      member_count: parseInt(r.member_count ?? '0'),
      visitor_count: parseInt(r.visitor_count ?? '0'),
      avg_attendance_rate: parseFloat(r.avg_attendance_rate ?? '0'),
      last_meeting_date: r.last_meeting_date,
      total_meetings: parseInt(r.total_meetings ?? '0'),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro ao buscar comparativo de grupos:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
