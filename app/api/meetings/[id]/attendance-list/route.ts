import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryOne, queryMany } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { normalizeInternalChecks } from '@/lib/attendance-list-internal';

type AuthError = { message: string; status: number };
type MeetingAuth =
  | { error: AuthError }
  | { meeting: { id: string; group_id: string; attendance_list_token: string | null }; leader: Awaited<ReturnType<typeof getCurrentLeader>> };

async function getMeetingAndAuth(meetingId: string): Promise<MeetingAuth> {
  await requireAuth();
  const leader = await getCurrentLeader();
  if (!leader?.group_id) {
    return { error: { message: 'Líder não está vinculado a um grupo', status: 400 } };
  }
  if (!canManageMeetings(leader.role)) {
    return { error: { message: SECRETARY_FORBIDDEN_MESSAGE, status: 403 } };
  }
  const meeting = await queryOne<{ id: string; group_id: string; attendance_list_token: string | null }>(
    `SELECT id, group_id, attendance_list_token FROM meetings WHERE id = $1`,
    [meetingId]
  );
  if (!meeting || meeting.group_id !== leader.group_id) {
    return { error: { message: 'Reunião não encontrada', status: 404 } };
  }
  if (!meeting.attendance_list_token) {
    return { error: { message: 'Este encontro não possui lista de presença', status: 400 } };
  }
  return { meeting, leader };
}

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

    const meetingRow = await queryOne<{
      id: string;
      group_id: string;
      title: string | null;
      meeting_date: string;
      meeting_time: string | null;
      location: string | null;
      attendance_list_token: string | null;
      attendance_list_deadline: string | null;
      attendance_list_internal_label: string | null;
      attendance_list_internal_checks: Record<string, boolean>;
      attendance_list_internal_enabled: boolean;
      attendance_list_internal_result_positive: string | null;
      attendance_list_internal_result_negative: string | null;
      attendance_list_internal_unmarked_label: string | null;
    }>(
      `SELECT id, group_id, title, meeting_date, meeting_time, location, attendance_list_token, attendance_list_deadline,
              attendance_list_internal_label,
              COALESCE(attendance_list_internal_checks, '{}'::jsonb) AS attendance_list_internal_checks,
              COALESCE(attendance_list_internal_enabled, FALSE) AS attendance_list_internal_enabled,
              attendance_list_internal_result_positive,
              attendance_list_internal_result_negative,
              attendance_list_internal_unmarked_label
       FROM meetings WHERE id = $1`,
      [meetingId]
    );

    if (!meetingRow || meetingRow.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    if (!meetingRow.attendance_list_token) {
      return NextResponse.json(
        { error: 'Este encontro não possui lista de presença' },
        { status: 400 }
      );
    }

    const members = await queryMany<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM members WHERE group_id = $1 AND is_active = TRUE ORDER BY full_name ASC`,
      [meetingRow.group_id]
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
      registered_by_leader: boolean;
    }>(
      `SELECT id, first_name, last_name, registered_by_email, registered_by_phone,
              COALESCE(registered_by_leader, FALSE) AS registered_by_leader
       FROM attendance_list_guests WHERE meeting_id = $1 ORDER BY created_at ASC`,
      [meetingId]
    ).catch(() => []);

    const checksNorm = normalizeInternalChecks(meetingRow.attendance_list_internal_checks);

    return NextResponse.json({
      meeting: {
        id: meetingRow.id,
        title: meetingRow.title,
        meeting_date: meetingRow.meeting_date,
        meeting_time: meetingRow.meeting_time,
        location: meetingRow.location,
        attendance_list_deadline: meetingRow.attendance_list_deadline,
        attendance_list_internal_label: meetingRow.attendance_list_internal_label,
        attendance_list_internal_checks: checksNorm,
        attendance_list_internal_enabled: meetingRow.attendance_list_internal_enabled ?? false,
        attendance_list_internal_result_positive: meetingRow.attendance_list_internal_result_positive,
        attendance_list_internal_result_negative: meetingRow.attendance_list_internal_result_negative,
        attendance_list_internal_unmarked_label: meetingRow.attendance_list_internal_unmarked_label,
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
        registered_by_leader: g.registered_by_leader,
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

/**
 * PATCH /api/meetings/[id]/attendance-list
 * Líder/secretário: altera a resposta de um membro (presente <-> ausente).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const auth = await getMeetingAndAuth(meetingId);
    if ('error' in auth) {
      const err = auth.error;
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const { meeting } = auth;

    const body = await request.json();
    const {
      member_id,
      status: newStatus,
      internal_label,
      internal_checks,
      internal_enabled,
      internal_result_positive,
      internal_result_negative,
      internal_unmarked_label,
    } = body as {
      member_id?: string;
      status?: string;
      internal_label?: string | null;
      internal_checks?: Record<string, { a: boolean; b: boolean }>;
      internal_enabled?: boolean;
      internal_result_positive?: string | null;
      internal_result_negative?: string | null;
      internal_unmarked_label?: string | null;
    };

    const hasInternalPatch =
      internal_label !== undefined ||
      internal_checks !== undefined ||
      internal_enabled !== undefined ||
      internal_result_positive !== undefined ||
      internal_result_negative !== undefined ||
      internal_unmarked_label !== undefined;

    if (hasInternalPatch) {
      const parts: string[] = [];
      const vals: unknown[] = [meetingId];
      let p = 2;
      if (internal_label !== undefined) {
        parts.push(`attendance_list_internal_label = $${p++}`);
        const v =
          internal_label === null || String(internal_label).trim() === ''
            ? null
            : String(internal_label).trim().slice(0, 500);
        vals.push(v);
      }
      if (internal_checks !== undefined) {
        parts.push(`attendance_list_internal_checks = $${p++}::jsonb`);
        vals.push(JSON.stringify(normalizeInternalChecks(internal_checks ?? {})));
      }
      if (internal_enabled !== undefined) {
        parts.push(`attendance_list_internal_enabled = $${p++}`);
        vals.push(Boolean(internal_enabled));
      }
      if (internal_result_positive !== undefined) {
        parts.push(`attendance_list_internal_result_positive = $${p++}`);
        const v =
          internal_result_positive === null || String(internal_result_positive).trim() === ''
            ? null
            : String(internal_result_positive).trim().slice(0, 120);
        vals.push(v);
      }
      if (internal_result_negative !== undefined) {
        parts.push(`attendance_list_internal_result_negative = $${p++}`);
        const v =
          internal_result_negative === null || String(internal_result_negative).trim() === ''
            ? null
            : String(internal_result_negative).trim().slice(0, 120);
        vals.push(v);
      }
      if (internal_unmarked_label !== undefined) {
        parts.push(`attendance_list_internal_unmarked_label = $${p++}`);
        const v =
          internal_unmarked_label === null || String(internal_unmarked_label).trim() === ''
            ? null
            : String(internal_unmarked_label).trim().slice(0, 120);
        vals.push(v);
      }
      if (parts.length > 0) {
        await query(`UPDATE meetings SET ${parts.join(', ')} WHERE id = $1`, vals);
      }
      if (!member_id || !newStatus) {
        return NextResponse.json({ ok: true });
      }
    }

    if (!member_id || !newStatus) {
      return NextResponse.json(
        { error: 'Informe member_id e status (present ou absent), ou campos de checklist interno' },
        { status: 400 }
      );
    }
    if (newStatus !== 'present' && newStatus !== 'absent') {
      return NextResponse.json({ error: 'status deve ser "present" ou "absent"' }, { status: 400 });
    }

    const member = await queryOne<{ id: string }>(
      `SELECT id FROM members WHERE id = $1 AND group_id = $2 AND is_active = TRUE`,
      [member_id, meeting.group_id]
    );
    if (!member) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    await query(
      `INSERT INTO attendance_list_responses (meeting_id, member_id, status, email, phone)
       VALUES ($1, $2, $3, NULL, NULL)
       ON CONFLICT (meeting_id, member_id) DO UPDATE SET status = $3`,
      [meetingId, member_id, newStatus]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro ao atualizar confirmação:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

/**
 * DELETE /api/meetings/[id]/attendance-list
 * Líder/secretário: reseta a confirmação de um membro (remove o registro).
 * Body: { member_id: string }
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const auth = await getMeetingAndAuth(meetingId);
    if ('error' in auth) {
      const err = auth.error;
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const { meeting } = auth;

    const body = await request.json().catch(() => ({}));
    const { member_id } = body as { member_id?: string };

    if (!member_id) {
      return NextResponse.json({ error: 'Informe member_id' }, { status: 400 });
    }

    const member = await queryOne<{ id: string }>(
      `SELECT id FROM members WHERE id = $1 AND group_id = $2 AND is_active = TRUE`,
      [member_id, meeting.group_id]
    );
    if (!member) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    await query(
      `DELETE FROM attendance_list_responses WHERE meeting_id = $1 AND member_id = $2`,
      [meetingId, member_id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro ao resetar confirmação:', error);
    return NextResponse.json({ error: 'Erro ao resetar' }, { status: 500 });
  }
}
