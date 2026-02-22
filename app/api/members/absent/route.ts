import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';

export interface AbsentMember {
  id: string;
  full_name: string;
  phone: string | null;
  member_type: 'participant' | 'visitor';
  consecutive_absences: number;
}

/**
 * GET /api/members/absent
 * Returns all members with 1 or 2 consecutive absences (até duas faltas seguidas).
 * Used by the dashboard alerts panel and by the group message "Faltantes" filter.
 */
export async function GET() {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json([], { status: 200 });
    }

    // Get active members with their consecutive absence count
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
         WHERE m.group_id = $1 AND m.is_active = TRUE
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
