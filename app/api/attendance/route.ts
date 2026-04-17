import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { saveAttendance, getAttendanceByMeeting, getAttendanceGuestsByMeeting } from '@/lib/db/queries';
import { query, queryOne } from '@/lib/db/postgres';
import { syncEngagementToSheet } from '@/lib/integrations/google-sheets';

/**
 * Atualiza automaticamente o estágio de integração de visitantes com base no
 * número de presenças registradas após salvar chamada.
 */
async function updateVisitorIntegrationStages(groupId: string): Promise<void> {
  await query(
    `UPDATE members
     SET integration_stage = CASE
       WHEN (
         SELECT COUNT(*) FROM attendance a
         JOIN meetings m ON m.id = a.meeting_id
         WHERE a.member_id = members.id AND a.is_present = TRUE AND m.group_id = $1
       ) >= 4 THEN 'integrando'
       WHEN (
         SELECT COUNT(*) FROM attendance a
         JOIN meetings m ON m.id = a.meeting_id
         WHERE a.member_id = members.id AND a.is_present = TRUE AND m.group_id = $1
       ) >= 2 THEN 'retornou'
       ELSE 'novo_visitante'
     END
     WHERE group_id = $1 AND member_type = 'visitor' AND is_active = TRUE
       AND integration_stage != 'membro'`,
    [groupId]
  );
}

/**
 * GET /api/attendance?meeting_id=uuid
 * Retorna presenças de uma reunião (membros + visitantes não cadastrados)
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meeting_id');
    if (!meetingId) {
      return NextResponse.json({ error: 'meeting_id é obrigatório' }, { status: 400 });
    }

    const meeting = await queryOne<{ id: string; group_id: string }>(
      `SELECT id, group_id FROM meetings WHERE id = $1`,
      [meetingId]
    );
    if (!meeting || meeting.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    const [attendance, guests] = await Promise.all([
      getAttendanceByMeeting(meetingId),
      getAttendanceGuestsByMeeting(meetingId),
    ]);
    return NextResponse.json({ attendance, guests });
  } catch (error) {
    console.error('Erro ao buscar presenças:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * POST /api/attendance
 * Salva presenças de uma reunião
 */
export async function POST(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }

    const data = await request.json();
    const { meeting_id, attendance, guests } = data;

    if (!meeting_id || !Array.isArray(attendance)) {
      return NextResponse.json(
        { error: 'meeting_id e attendance são obrigatórios' },
        { status: 400 }
      );
    }

    const meeting = await queryOne<{ id: string; group_id: string }>(
      `SELECT id, group_id FROM meetings WHERE id = $1`,
      [meeting_id]
    );
    if (!meeting || meeting.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    const guestList = Array.isArray(guests)
      ? guests.map((g: { full_name?: string; phone?: string | null }) => ({
          full_name: typeof g.full_name === 'string' ? g.full_name : '',
          phone: g.phone ?? null,
        }))
      : [];

    await saveAttendance(meeting_id, attendance, {
      groupId: meeting.group_id,
      guests: guestList,
    });

    // Atualizar estágio de integração dos visitantes após salvar presença
    try {
      await updateVisitorIntegrationStages(meeting.group_id);
    } catch (err) {
      console.error('Erro ao atualizar estágio de visitantes:', err);
    }

    try {
      await syncEngagementToSheet(meeting.group_id, meeting_id);
    } catch {
      // Erro já logado em syncEngagementToSheet; não falha a resposta
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar presenças:', error);
    return NextResponse.json(
      { error: 'Erro ao salvar presenças' },
      { status: 500 }
    );
  }
}
