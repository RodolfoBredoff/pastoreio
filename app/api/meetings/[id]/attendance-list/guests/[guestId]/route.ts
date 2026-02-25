import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryOne } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';

/**
 * DELETE /api/meetings/[id]/attendance-list/guests/[guestId]
 * Líder/secretário: remove um visitante da lista de confirmação (reseta o cadastro).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; guestId: string }> }
) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json(
        { error: 'Líder não está vinculado a um grupo' },
        { status: 400 }
      );
    }

    if (!canManageMeetings(leader.role)) {
      return NextResponse.json({ error: SECRETARY_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const { id: meetingId, guestId } = await params;

    const meeting = await queryOne<{ id: string; group_id: string; attendance_list_token: string | null }>(
      `SELECT id, group_id, attendance_list_token FROM meetings WHERE id = $1`,
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

    const guest = await queryOne<{ id: string }>(
      `SELECT id FROM attendance_list_guests WHERE id = $1 AND meeting_id = $2`,
      [guestId, meetingId]
    );

    if (!guest) {
      return NextResponse.json({ error: 'Visitante não encontrado nesta lista' }, { status: 404 });
    }

    await query(
      `DELETE FROM attendance_list_guests WHERE id = $1 AND meeting_id = $2`,
      [guestId, meetingId]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover visitante da lista:', error);
    return NextResponse.json({ error: 'Erro ao remover visitante' }, { status: 500 });
  }
}
