import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';

/**
 * POST /api/meetings
 * Creates a single meeting for the leader's group.
 * For special_event, optional: location, generate_attendance_list (gera link da lista de presença).
 */
export async function POST(request: Request) {
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

    const data = await request.json();
    const {
      meeting_date,
      meeting_time,
      title,
      notes,
      meeting_type,
      location,
      generate_attendance_list,
      attendance_list_deadline,
    } = data as {
      meeting_date: string;
      meeting_time?: string | null;
      title?: string | null;
      notes?: string | null;
      meeting_type?: 'regular' | 'special_event';
      location?: string | null;
      generate_attendance_list?: boolean;
      attendance_list_deadline?: string | null;
    };

    if (!meeting_date) {
      return NextResponse.json({ error: 'meeting_date é obrigatório' }, { status: 400 });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(meeting_date)) {
      return NextResponse.json({ error: 'Formato de data inválido (esperado: YYYY-MM-DD)' }, { status: 400 });
    }

    const type = meeting_type === 'special_event' ? 'special_event' : 'regular';
    const withList = type === 'special_event' && Boolean(generate_attendance_list);
    const attendanceListToken = withList ? randomUUID() : null;
    const locationVal = location != null && String(location).trim() !== '' ? String(location).trim() : null;
    let attendanceListDeadlineVal: string | null = null;

    if (attendance_list_deadline) {
      if (!dateRegex.test(attendance_list_deadline)) {
        return NextResponse.json(
          { error: 'Formato de data inválido para o prazo de confirmação (esperado: YYYY-MM-DD)' },
          { status: 400 }
        );
      }
      // Armazena o prazo como final do dia no fuso padrão do servidor
      attendanceListDeadlineVal = `${attendance_list_deadline}T23:59:59.999Z`;
    }

    const result = await query(
      `INSERT INTO meetings (group_id, meeting_date, meeting_time, title, notes, meeting_type, is_cancelled, location, attendance_list_token, attendance_list_deadline)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8, $9)
       ON CONFLICT (group_id, meeting_date) DO NOTHING
       RETURNING *`,
      [
        leader.group_id,
        meeting_date,
        meeting_time || null,
        title || null,
        notes || null,
        type,
        locationVal,
        attendanceListToken,
        attendanceListDeadlineVal,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Já existe um encontro nesta data para o grupo' },
        { status: 409 }
      );
    }

    const row = result.rows[0] as Record<string, unknown>;
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar encontro:', error);
    return NextResponse.json({ error: 'Erro ao criar encontro' }, { status: 500 });
  }
}
