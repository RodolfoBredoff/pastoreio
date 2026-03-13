import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';

export interface AbsentMember {
  id: string;
  full_name: string;
  phone: string | null;
  member_type: 'participant' | 'visitor';
  consecutive_absences?: number;
}

type MemberFilter = 'total' | 'participants' | 'visitors';

function memberTypeCondition(memberFilter: MemberFilter): string {
  if (memberFilter === 'participants') return " AND m.member_type = 'participant'";
  if (memberFilter === 'visitors') return " AND m.member_type = 'visitor'";
  return '';
}

/**
 * GET /api/members/absent
 * Query params:
 * - mode=consecutive (default): 1–2 faltas seguidas nos últimos encontros.
 * - mode=most_absent: quem mais faltou nos últimos 10 encontros (ordenado por total de faltas). Use limit=N (default 50).
 * - meeting_ids=id1,id2: faltantes em pelo menos um dos encontros informados (ignora mode).
 * - member_filter=total|participants|visitors: filtrar por tipo (total, só participantes ou só visitantes).
 * - presence=absent|present: absent (default) = lista de faltantes; present = lista de presentes no último encontro.
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json([], { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'consecutive';
    const meetingIdsParam = searchParams.get('meeting_ids');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
    const memberFilterParam = searchParams.get('member_filter');
    const memberFilter: MemberFilter =
      memberFilterParam === 'participants' || memberFilterParam === 'visitors' ? memberFilterParam : 'total';
    const presence = searchParams.get('presence') === 'present' ? 'present' : 'absent';

    const meetingIds =
      meetingIdsParam && meetingIdsParam.trim()
        ? meetingIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
        : [];

    const typeCond = memberTypeCondition(memberFilter);

    // Presentes: quem esteve presente no último encontro
    if (presence === 'present') {
      const presentMembers = await queryMany<AbsentMember>(
        `WITH last_meeting AS (
           SELECT id FROM meetings
           WHERE group_id = $1 AND is_cancelled = FALSE AND meeting_date <= CURRENT_DATE
           ORDER BY meeting_date DESC LIMIT 1
         )
         SELECT m.id, m.full_name, m.phone, m.member_type, 0 AS consecutive_absences
         FROM members m
         INNER JOIN attendance a ON a.member_id = m.id
         INNER JOIN last_meeting lm ON lm.id = a.meeting_id
         WHERE m.group_id = $1 AND m.is_active = TRUE AND a.is_present = TRUE${typeCond}
         ORDER BY m.full_name ASC`,
        [leader.group_id]
      );
      return NextResponse.json(presentMembers);
    }

    // Faltantes em encontro(s) específico(s): quem não esteve presente em pelo menos um dos encontros
    if (meetingIds.length > 0) {
      const absentByMeeting = await queryMany<AbsentMember>(
        `SELECT DISTINCT m.id, m.full_name, m.phone, m.member_type
         FROM members m
         INNER JOIN meetings mt ON mt.group_id = m.group_id AND mt.id = ANY($2::uuid[])
         WHERE m.group_id = $1 AND m.is_active = TRUE${typeCond}
           AND NOT EXISTS (
             SELECT 1 FROM attendance a
             WHERE a.meeting_id = mt.id AND a.member_id = m.id AND a.is_present = TRUE
           )
         ORDER BY m.full_name ASC`,
        [leader.group_id, meetingIds]
      );
      return NextResponse.json(absentByMeeting);
    }

    // Mais faltantes: total de faltas nos últimos 10 encontros, ordenado do que mais faltou
    if (mode === 'most_absent') {
      const mostAbsent = await queryMany<AbsentMember & { total_absences: number }>(
        `WITH last_meetings AS (
           SELECT id FROM meetings
           WHERE group_id = $1 AND is_cancelled = FALSE AND meeting_date <= CURRENT_DATE
           ORDER BY meeting_date DESC LIMIT 10
         ),
         member_total AS (
           SELECT
             m.id,
             m.full_name,
             m.phone,
             m.member_type,
             (
               SELECT COUNT(*)::int FROM last_meetings lm
               LEFT JOIN attendance a ON a.meeting_id = lm.id AND a.member_id = m.id
               WHERE a.id IS NULL OR a.is_present = FALSE
             ) AS total_absences
           FROM members m
           WHERE m.group_id = $1 AND m.is_active = TRUE${typeCond}
         )
         SELECT id, full_name, phone, member_type, total_absences AS consecutive_absences
         FROM member_total
         WHERE total_absences >= 1
         ORDER BY total_absences DESC, full_name ASC
         LIMIT $2`,
        [leader.group_id, limit]
      );
      return NextResponse.json(mostAbsent);
    }

    // Default: 1 ou 2 faltas seguidas (comportamento original)
    const absentMembers = await queryMany<AbsentMember>(
      `WITH last_meetings AS (
         SELECT id, meeting_date
         FROM meetings
         WHERE group_id = $1
           AND is_cancelled = FALSE
           AND meeting_date <= CURRENT_DATE
         ORDER BY meeting_date DESC
         LIMIT 10
       ),
       member_absences AS (
         SELECT
           m.id,
           m.full_name,
           m.phone,
           m.member_type,
           (
             SELECT COUNT(*)::int
             FROM (
               SELECT lm.id, lm.meeting_date,
                      COALESCE(a.is_present, FALSE) as is_present
               FROM last_meetings lm
               LEFT JOIN attendance a ON a.meeting_id = lm.id AND a.member_id = m.id
               ORDER BY lm.meeting_date DESC
             ) AS recent
             WHERE is_present = FALSE
               AND meeting_date > COALESCE(
                 (SELECT MAX(meeting_date) FROM (
                   SELECT lm2.meeting_date
                   FROM last_meetings lm2
                   LEFT JOIN attendance a2 ON a2.meeting_id = lm2.id AND a2.member_id = m.id
                   WHERE COALESCE(a2.is_present, FALSE) = TRUE
                 ) present_dates), '1900-01-01'::date
               )
           ) AS consecutive_absences
         FROM members m
         WHERE m.group_id = $1 AND m.is_active = TRUE${typeCond}
       )
       SELECT id, full_name, phone, member_type, consecutive_absences
       FROM member_absences
       WHERE consecutive_absences >= 1 AND consecutive_absences <= 2
       ORDER BY consecutive_absences DESC, full_name ASC`,
      [leader.group_id]
    );

    return NextResponse.json(absentMembers);
  } catch (error) {
    console.error('Erro ao buscar membros ausentes:', error);
    return NextResponse.json([], { status: 200 });
  }
}
