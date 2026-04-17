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

/** Limite alto quando scope=all (todos os encontros registrados) */
const MEETING_LIMIT_ALL = 500;

/**
 * Converte o parâmetro `scope` em um número de encontros a considerar.
 * Aceita: "all", "last5", "last10", ou "lastN" para qualquer inteiro N >= 1.
 * Default: 10.
 */
function parseScopeLimit(scopeRaw: string): number {
  if (scopeRaw === 'all') return MEETING_LIMIT_ALL;
  const match = scopeRaw.match(/^last(\d+)$/);
  if (match) {
    const n = parseInt(match[1], 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, MEETING_LIMIT_ALL) : 10;
  }
  return 10;
}

/**
 * GET /api/members/absent
 * Query params:
 * - mode=consecutive|most_absent|month — critério de faltas (default consecutive)
 * - scope=all|lastN — janela de encontros para most_absent e consecutive (default last10)
 *   Exemplos: scope=last5, scope=last10, scope=last7, scope=last20, scope=all
 * - year_month=YYYY-MM — obrigatório se mode=month
 * - meeting_ids=id1,id2 — faltantes em pelo menos um dos encontros (ignora mode)
 * - member_filter=total|participants|visitors
 * - presence=absent|present
 * - limit=N — limite de resultados (default 50, max 200)
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json([], { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const modeParam = searchParams.get('mode') || 'consecutive';
    const meetingIdsParam = searchParams.get('meeting_ids');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
    const memberFilterParam = searchParams.get('member_filter');
    const memberFilter: MemberFilter =
      memberFilterParam === 'participants' || memberFilterParam === 'visitors' ? memberFilterParam : 'total';
    const presence = searchParams.get('presence') === 'present' ? 'present' : 'absent';
    const scopeRaw = searchParams.get('scope')?.toLowerCase() ?? '';
    const yearMonth = searchParams.get('year_month')?.trim() || null;

    const meetingIds =
      meetingIdsParam && meetingIdsParam.trim()
        ? meetingIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
        : [];

    const typeCond = memberTypeCondition(memberFilter);

    if (presence === 'present') {
      const presentMembers = await queryMany<AbsentMember>(
        `WITH last_meeting AS (
           SELECT id, meeting_date FROM meetings
           WHERE group_id = $1 AND is_cancelled = FALSE AND meeting_date <= CURRENT_DATE
           ORDER BY meeting_date DESC LIMIT 1
         )
         SELECT m.id, m.full_name, m.phone, m.member_type, 0 AS consecutive_absences
         FROM members m
         INNER JOIN attendance a ON a.member_id = m.id
         INNER JOIN last_meeting lm ON lm.id = a.meeting_id
         WHERE m.group_id = $1 AND m.is_active = TRUE AND a.is_present = TRUE${typeCond}
           AND lm.meeting_date >= (m.created_at AT TIME ZONE 'UTC')::date
         ORDER BY m.full_name ASC`,
        [leader.group_id]
      );
      return NextResponse.json(presentMembers);
    }

    if (meetingIds.length > 0) {
      const absentByMeeting = await queryMany<AbsentMember>(
        `SELECT DISTINCT m.id, m.full_name, m.phone, m.member_type
         FROM members m
         INNER JOIN meetings mt ON mt.group_id = m.group_id AND mt.id = ANY($2::uuid[])
         WHERE m.group_id = $1 AND m.is_active = TRUE${typeCond}
           AND mt.meeting_date >= (m.created_at AT TIME ZONE 'UTC')::date
           AND NOT EXISTS (
             SELECT 1 FROM attendance a
             WHERE a.meeting_id = mt.id AND a.member_id = m.id AND a.is_present = TRUE
           )
         ORDER BY m.full_name ASC`,
        [leader.group_id, meetingIds]
      );
      return NextResponse.json(absentByMeeting);
    }

    const meetingLimit = parseScopeLimit(scopeRaw);

    if (modeParam === 'most_absent') {
      const mostAbsent = await queryMany<AbsentMember>(
        `WITH last_meetings AS (
           SELECT id, meeting_date FROM meetings
           WHERE group_id = $1 AND is_cancelled = FALSE AND meeting_date <= CURRENT_DATE
           ORDER BY meeting_date DESC
           LIMIT $3
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
               WHERE lm.meeting_date >= (m.created_at AT TIME ZONE 'UTC')::date
                 AND (a.id IS NULL OR a.is_present = FALSE)
             ) AS total_absences
           FROM members m
           WHERE m.group_id = $1 AND m.is_active = TRUE${typeCond}
         )
         SELECT id, full_name, phone, member_type, total_absences AS consecutive_absences
         FROM member_total
         WHERE total_absences >= 1
         ORDER BY total_absences DESC, full_name ASC
         LIMIT $2`,
        [leader.group_id, limit, meetingLimit]
      );
      return NextResponse.json(mostAbsent);
    }

    if (modeParam === 'month' && yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const monthAbsent = await queryMany<AbsentMember>(
        `WITH meetings_month AS (
           SELECT id, meeting_date FROM meetings
           WHERE group_id = $1 AND is_cancelled = FALSE AND meeting_date <= CURRENT_DATE
             AND to_char(meeting_date, 'YYYY-MM') = $3
         ),
         member_total AS (
           SELECT
             m.id,
             m.full_name,
             m.phone,
             m.member_type,
             (
               SELECT COUNT(*)::int FROM meetings_month mm
               LEFT JOIN attendance a ON a.meeting_id = mm.id AND a.member_id = m.id
               WHERE mm.meeting_date >= (m.created_at AT TIME ZONE 'UTC')::date
                 AND (a.id IS NULL OR a.is_present = FALSE)
             ) AS total_absences
           FROM members m
           WHERE m.group_id = $1 AND m.is_active = TRUE${typeCond}
         )
         SELECT id, full_name, phone, member_type, total_absences AS consecutive_absences
         FROM member_total
         WHERE total_absences >= 1
         ORDER BY total_absences DESC, full_name ASC
         LIMIT $2`,
        [leader.group_id, limit, yearMonth]
      );
      return NextResponse.json(monthAbsent);
    }

    if (modeParam === 'month') {
      return NextResponse.json([]);
    }

    // consecutive: faltas seguidas desde o encontro mais recente até a última presença
    const absentMembers = await queryMany<AbsentMember>(
      `WITH last_meetings AS (
         SELECT id, meeting_date
         FROM meetings
         WHERE group_id = $1
           AND is_cancelled = FALSE
           AND meeting_date <= CURRENT_DATE
         ORDER BY meeting_date DESC
         LIMIT $2
       )
       SELECT m.id, m.full_name, m.phone, m.member_type, ca.consecutive_absences
       FROM members m
       CROSS JOIN LATERAL (
         WITH ordered AS (
           SELECT
             lm.meeting_date,
             COALESCE(a.is_present, FALSE) AS is_present,
             ROW_NUMBER() OVER (ORDER BY lm.meeting_date DESC) AS rn
           FROM last_meetings lm
           LEFT JOIN attendance a ON a.meeting_id = lm.id AND a.member_id = m.id
           WHERE lm.meeting_date >= (m.created_at AT TIME ZONE 'UTC')::date
         ),
         fp AS (
           SELECT MIN(rn) AS first_present_rn FROM ordered WHERE is_present = TRUE
         )
         SELECT CASE
           WHEN (SELECT first_present_rn FROM fp) IS NULL THEN (
             (SELECT COUNT(*)::int FROM ordered o WHERE NOT o.is_present)
           )
           ELSE GREATEST((SELECT first_present_rn FROM fp) - 1, 0)
         END::int AS consecutive_absences
       ) ca
       WHERE m.group_id = $1 AND m.is_active = TRUE${typeCond}
         AND ca.consecutive_absences >= 1
       ORDER BY ca.consecutive_absences DESC, m.full_name ASC`,
      [leader.group_id, meetingLimit]
    );

    return NextResponse.json(absentMembers);
  } catch (error) {
    console.error('Erro ao buscar membros ausentes:', error);
    return NextResponse.json([], { status: 200 });
  }
}
