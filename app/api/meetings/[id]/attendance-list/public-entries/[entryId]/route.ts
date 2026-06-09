import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryOne } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { isValidRg, normalizeRg } from '@/lib/attendance-list-public';

/**
 * PATCH /api/meetings/[id]/attendance-list/public-entries/[entryId]
 * Edita uma entrada pública (nome, e-mail, telefone).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
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

    const { id: meetingId, entryId } = await params;

    const meeting = await queryOne<{ id: string; group_id: string; attendance_list_require_rg: boolean }>(
      `SELECT id, group_id, COALESCE(attendance_list_require_rg, FALSE) AS attendance_list_require_rg
       FROM meetings WHERE id = $1`,
      [meetingId]
    );

    if (!meeting || meeting.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    const entry = await queryOne<{ id: string; meeting_id: string }>(
      `SELECT id, meeting_id FROM attendance_list_public_entries WHERE id = $1`,
      [entryId]
    );

    if (!entry || entry.meeting_id !== meetingId) {
      return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { first_name, last_name, email, phone, rg } = body as {
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
      rg?: string;
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

    await query(
      `UPDATE attendance_list_public_entries
       SET first_name = $1, last_name = $2, email = $3, phone = $4, rg = $5
       WHERE id = $6`,
      [fn, ln, em, ph, meeting.attendance_list_require_rg ? rgVal : null, entryId]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro ao editar entrada pública:', error);
    return NextResponse.json({ error: 'Erro ao editar' }, { status: 500 });
  }
}

/**
 * DELETE /api/meetings/[id]/attendance-list/public-entries/[entryId]
 * Remove uma entrada pública.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
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

    const { id: meetingId, entryId } = await params;

    const meeting = await queryOne<{ id: string; group_id: string }>(
      `SELECT id, group_id FROM meetings WHERE id = $1`,
      [meetingId]
    );

    if (!meeting || meeting.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    const entry = await queryOne<{ id: string; meeting_id: string }>(
      `SELECT id, meeting_id FROM attendance_list_public_entries WHERE id = $1`,
      [entryId]
    );

    if (!entry || entry.meeting_id !== meetingId) {
      return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
    }

    await query(
      `DELETE FROM attendance_list_public_entries WHERE id = $1`,
      [entryId]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover entrada pública:', error);
    return NextResponse.json({ error: 'Erro ao remover' }, { status: 500 });
  }
}
