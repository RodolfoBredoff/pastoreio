import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, query } from '@/lib/db/postgres';

/**
 * GET /api/sync
 * Retorna membros, reuniões e presenças do grupo do líder para cache offline.
 * Usado pelo cliente para popular o IndexedDB quando online.
 */
export async function GET() {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json(
        { error: 'Líder não está vinculado a um grupo' },
        { status: 400 }
      );
    }

    const groupId = leader.group_id;

    const [members, meetings, attendanceRows] = await Promise.all([
      queryMany<{
        id: string;
        group_id: string;
        full_name: string;
        phone: string;
        birth_date: string | null;
        member_type: string;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, group_id, full_name, phone, birth_date, member_type, is_active, created_at, updated_at
         FROM members WHERE group_id = $1 AND is_active = TRUE ORDER BY full_name ASC`,
        [groupId]
      ),
      queryMany<{
        id: string;
        group_id: string;
        meeting_date: string;
        meeting_time: string | null;
        is_cancelled: boolean;
        title: string | null;
        notes: string | null;
        meeting_type: string;
        created_at: string;
      }>(
        `SELECT id, group_id, meeting_date, meeting_time, is_cancelled, title, notes, meeting_type, created_at
         FROM meetings
         WHERE group_id = $1
           AND meeting_date >= (CURRENT_DATE - INTERVAL '2 months')
         ORDER BY meeting_date DESC
         LIMIT 100`,
        [groupId]
      ),
      (async () => {
        const meetingsForAttendance = await queryMany<{ id: string }>(
          `SELECT id FROM meetings
           WHERE group_id = $1 AND meeting_date >= (CURRENT_DATE - INTERVAL '2 months')
           LIMIT 100`,
          [groupId]
        );
        const meetingIds = meetingsForAttendance.map((m) => m.id);
        if (meetingIds.length === 0) return [];
        const placeholders = meetingIds.map((_, i) => `$${i + 1}`).join(', ');
        const result = await query<{
          id: string;
          meeting_id: string;
          member_id: string;
          is_present: boolean;
          created_at: string;
        }>(
          `SELECT id, meeting_id, member_id, is_present, created_at
           FROM attendance WHERE meeting_id IN (${placeholders})`,
          meetingIds
        );
        return result.rows;
      })(),
    ]);

    return NextResponse.json({
      members: members.map((m) => ({
        ...m,
        synced: true,
      })),
      meetings: meetings.map((m) => ({
        ...m,
        synced: true,
      })),
      attendance: attendanceRows.map((a) => ({
        ...a,
        synced: true,
      })),
    });
  } catch (error) {
    console.error('Erro ao buscar dados para sync:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados' },
      { status: 500 }
    );
  }
}
