import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryOne } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import {
  getAttendanceConfirmedCount,
  isAttendanceLimitReached,
  type AttendanceListMode,
} from '@/lib/attendance-list-public';

/**
 * POST /api/meetings/[id]/attendance-list/guests
 * Líder/secretário: adiciona visitante à lista do encontro (inclui após prazo do link público).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não está vinculado a um grupo' }, { status: 400 });
    }

    if (!canManageMeetings(leader.role)) {
      return NextResponse.json({ error: SECRETARY_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const { id: meetingId } = await params;
    const body = await request.json();
    const { first_name, last_name } = body as { first_name?: string; last_name?: string };

    const firstName = typeof first_name === 'string' ? first_name.trim() : '';
    const lastName = typeof last_name === 'string' ? last_name.trim() : '';

    if (!firstName) {
      return NextResponse.json({ error: 'Informe o nome do visitante' }, { status: 400 });
    }
    if (!lastName) {
      return NextResponse.json({ error: 'Informe o sobrenome do visitante' }, { status: 400 });
    }

    const meeting = await queryOne<{
      id: string;
      group_id: string;
      attendance_list_token: string | null;
      attendance_list_mode: string | null;
      attendance_list_limit: number | null;
    }>(
      `SELECT id, group_id, attendance_list_token, attendance_list_mode, attendance_list_limit
       FROM meetings WHERE id = $1`,
      [meetingId]
    );

    if (!meeting || meeting.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    if (!meeting.attendance_list_token) {
      return NextResponse.json(
        { error: 'Este encontro não possui lista de presença' },
        { status: 400 }
      );
    }

    const mode = (meeting.attendance_list_mode ?? 'prefilled') as AttendanceListMode;
    const count = await getAttendanceConfirmedCount(meetingId, mode);
    if (isAttendanceLimitReached(count, meeting.attendance_list_limit)) {
      return NextResponse.json(
        { error: 'O limite de inscrições para este evento já foi atingido' },
        { status: 400 }
      );
    }

    const row = await queryOne<{ id: string }>(
      `INSERT INTO attendance_list_guests (meeting_id, first_name, last_name, registered_by_email, registered_by_phone, registered_by_leader)
       VALUES ($1, $2, $3, NULL, NULL, TRUE)
       RETURNING id`,
      [meetingId, firstName, lastName]
    );

    const guestId = row?.id;
    return NextResponse.json({ ok: true, id: guestId });
  } catch (error) {
    console.error('Erro ao adicionar visitante (líder):', error);
    return NextResponse.json({ error: 'Erro ao adicionar visitante' }, { status: 500 });
  }
}
