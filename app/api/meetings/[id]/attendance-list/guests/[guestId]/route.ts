import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryOne } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { getMeetingExtraFields, normalizeExtraValues } from '@/lib/attendance-list-extra';

/**
 * PATCH /api/meetings/[id]/attendance-list/guests/[guestId]
 * Líder/secretário: edita um visitante da lista (nome/sobrenome e campos adicionais).
 */
export async function PATCH(
  request: Request,
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

    const body = await request.json();
    const { first_name, last_name, extra_values } = body as {
      first_name?: string;
      last_name?: string;
      extra_values?: unknown;
    };

    const firstName = typeof first_name === 'string' ? first_name.trim() : '';
    const lastName = typeof last_name === 'string' ? last_name.trim() : '';

    if (!firstName) {
      return NextResponse.json({ error: 'Informe o nome do visitante' }, { status: 400 });
    }
    if (!lastName) {
      return NextResponse.json({ error: 'Informe o sobrenome do visitante' }, { status: 400 });
    }

    // Campos adicionais: valida e atualiza quando enviados
    let extraValuesJson: string | null = null;
    if (extra_values !== undefined) {
      const extraFields = await getMeetingExtraFields(meetingId);
      if (extraFields.length > 0) {
        const extraRes = normalizeExtraValues(extraFields, extra_values);
        if (!extraRes.ok) {
          return NextResponse.json({ error: extraRes.error }, { status: 400 });
        }
        extraValuesJson = JSON.stringify(extraRes.values);
      } else {
        extraValuesJson = '[]';
      }
    }

    if (extraValuesJson !== null) {
      await query(
        `UPDATE attendance_list_guests
         SET first_name = $1, last_name = $2, extra_values = $3::jsonb
         WHERE id = $4 AND meeting_id = $5`,
        [firstName, lastName, extraValuesJson, guestId, meetingId]
      );
    } else {
      await query(
        `UPDATE attendance_list_guests
         SET first_name = $1, last_name = $2
         WHERE id = $3 AND meeting_id = $4`,
        [firstName, lastName, guestId, meetingId]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro ao editar visitante da lista:', error);
    return NextResponse.json({ error: 'Erro ao editar visitante' }, { status: 500 });
  }
}

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
