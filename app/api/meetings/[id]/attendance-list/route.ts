import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryOne, queryMany } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';

/**
 * GET /api/meetings/[id]/attendance-list
 * Lista de confirmação interna: apenas líder e secretário do grupo.
 * Retorna membros (resposta + e-mail ou telefone de quem respondeu) e visitantes (nome + quem cadastrou com e-mail/telefone).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
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

    const { id: meetingId } = await params;

    const meeting = await queryOne<{
      id: string;
      group_id: string;
      title: string | null;
      meeting_date: string;
      meeting_time: string | null;
      location: string | null;
      attendance_list_token: string | null;
    }>(
      `SELECT id, group_id, title, meeting_date, meeting_time, location, attendance_list_token
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

    const members = await queryMany<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM members WHERE group_id = $1 AND is_active = TRUE ORDER BY full_name ASC`,
      [meeting.group_id]
    );

    const responses = await queryMany<{
      member_id: string;
      status: string;
      email: string | null;
      phone: string | null;
    }>(
      `SELECT member_id, status, email, phone FROM attendance_list_responses WHERE meeting_id = $1`,
      [meetingId]
    ).catch(() => []);

    const responseMap: Record<string, { status: string; email: string | null; phone: string | null }> = {};
    for (const r of responses) {
      responseMap[r.member_id] = { status: r.status, email: r.email, phone: r.phone };
    }

    const guests = await queryMany<{
      id: string;
      first_name: string;
      last_name: string;
      registered_by_email: string | null;
      registered_by_phone: string | null;
    }>(
      `SELECT id, first_name, last_name, registered_by_email, registered_by_phone
       FROM attendance_list_guests WHERE meeting_id = $1 ORDER BY created_at ASC`,
      [meetingId]
    ).catch(() => []);

    return NextResponse.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        meeting_date: meeting.meeting_date,
        meeting_time: meeting.meeting_time,
        location: meeting.location,
      },
      members: members.map((m) => ({
        id: m.id,
        full_name: m.full_name,
        response: responseMap[m.id] ?? null,
      })),
      guests: guests.map((g) => ({
        id: g.id,
        first_name: g.first_name,
        last_name: g.last_name,
        full_name: `${g.first_name} ${g.last_name}`.trim(),
        registered_by_email: g.registered_by_email,
        registered_by_phone: g.registered_by_phone,
      })),
    });
  } catch (error) {
    console.error('Erro ao buscar lista de confirmação:', error);
    return NextResponse.json(
      { error: 'Erro ao carregar lista de confirmação' },
      { status: 500 }
    );
  }
}
