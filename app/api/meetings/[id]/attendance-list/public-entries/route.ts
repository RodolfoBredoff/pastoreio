import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryOne } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { v4 as uuidv4 } from 'uuid';
import {
  getAttendanceConfirmedCount,
  isAttendanceLimitReached,
  isValidRg,
  normalizeRg,
  type AttendanceListMode,
} from '@/lib/attendance-list-public';
import { getMeetingExtraFields, normalizeExtraValues } from '@/lib/attendance-list-extra';

/**
 * POST /api/meetings/[id]/attendance-list/public-entries
 * Adiciona manualmente uma entrada pública (autocadastro) pelo líder/secretário.
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

    const meeting = await queryOne<{
      id: string;
      group_id: string;
      attendance_list_mode: string | null;
      attendance_list_require_rg: boolean;
      attendance_list_limit: number | null;
    }>(
      `SELECT id, group_id, attendance_list_mode,
              COALESCE(attendance_list_require_rg, FALSE) AS attendance_list_require_rg,
              attendance_list_limit
       FROM meetings WHERE id = $1`,
      [meetingId]
    );

    if (!meeting || meeting.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const { first_name, last_name, email, phone, rg, extra_values } = body as {
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
      rg?: string;
      extra_values?: unknown;
    };

    const fn = first_name?.trim();
    const ln = last_name?.trim();
    const em = email?.trim() || null;
    const ph = phone?.replace(/\D/g, '') || null;
    const rgVal = typeof rg === 'string' ? normalizeRg(rg) : '';

    if (!fn || !ln) {
      return NextResponse.json({ error: 'Nome e sobrenome são obrigatórios' }, { status: 400 });
    }

    if (!em && !ph) {
      return NextResponse.json({ error: 'Informe e-mail ou telefone' }, { status: 400 });
    }

    if (meeting.attendance_list_require_rg) {
      if (!rgVal) {
        return NextResponse.json({ error: 'Informe o RG' }, { status: 400 });
      }
      if (!isValidRg(rgVal)) {
        return NextResponse.json({ error: 'Informe um RG válido' }, { status: 400 });
      }
    }

    const mode = (meeting.attendance_list_mode ?? 'open') as AttendanceListMode;

    // Campos adicionais obrigatórios (mesma regra do link público)
    const extraFields = await getMeetingExtraFields(meetingId);
    let extraValues: unknown = [];
    if (extraFields.length > 0) {
      const extraRes = normalizeExtraValues(extraFields, extra_values);
      if (!extraRes.ok) {
        return NextResponse.json({ error: extraRes.error }, { status: 400 });
      }
      extraValues = extraRes.values;
    }

    const count = await getAttendanceConfirmedCount(meetingId, mode);
    if (isAttendanceLimitReached(count, meeting.attendance_list_limit)) {
      return NextResponse.json(
        { error: 'O limite de inscrições para este evento já foi atingido' },
        { status: 400 }
      );
    }

    const id = uuidv4();
    await query(
      `INSERT INTO attendance_list_public_entries (id, meeting_id, first_name, last_name, email, phone, rg, extra_values)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [id, meetingId, fn, ln, em, ph, meeting.attendance_list_require_rg ? rgVal : null, JSON.stringify(extraValues)]
    );

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('Erro ao adicionar entrada pública:', error);
    return NextResponse.json({ error: 'Erro ao adicionar' }, { status: 500 });
  }
}
