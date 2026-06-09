import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryOne } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';

/**
 * PUT /api/meetings/[id]
 * Updates a meeting. Leaders and secretaries can edit meetings.
 */
export async function PUT(
  request: Request,
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

    const { id } = await params;

    const existing = await queryOne<{ id: string; group_id: string; meeting_date: string }>(
      `SELECT id, group_id, meeting_date FROM meetings WHERE id = $1`,
      [id]
    );

    if (!existing || existing.group_id !== leader.group_id) {
      return NextResponse.json(
        { error: 'Reunião não encontrada' },
        { status: 404 }
      );
    }

    const data = await request.json();
    const {
      meeting_date,
      meeting_time,
      is_cancelled,
      title,
      notes,
      meeting_type,
      location,
      attendance_list_deadline,
      attendance_list_require_rg,
      attendance_list_limit,
    } = data as {
      meeting_date?: string;
      meeting_time?: string | null;
      is_cancelled?: boolean;
      title?: string | null;
      notes?: string | null;
      meeting_type?: 'regular' | 'special_event';
      location?: string | null;
      attendance_list_deadline?: string | null;
      attendance_list_require_rg?: boolean;
      attendance_list_limit?: number | null;
    };

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (meeting_date !== undefined) {
      updates.push(`meeting_date = $${paramIndex++}`);
      values.push(meeting_date);
    }
    if (meeting_time !== undefined) {
      updates.push(`meeting_time = $${paramIndex++}`);
      values.push(meeting_time || null);
    }
    if (is_cancelled !== undefined) {
      updates.push(`is_cancelled = $${paramIndex++}`);
      values.push(is_cancelled);
    }
    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title || null);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes || null);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      const trimmed = typeof location === 'string' ? location.trim() : '';
      values.push(trimmed || null);
    }
    if (meeting_type !== undefined && (meeting_type === 'regular' || meeting_type === 'special_event')) {
      updates.push(`meeting_type = $${paramIndex++}`);
      values.push(meeting_type);
    }
    if (attendance_list_deadline !== undefined) {
      if (attendance_list_deadline) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(attendance_list_deadline)) {
          return NextResponse.json(
            { error: 'Formato de data inválido para o prazo de confirmação (esperado: YYYY-MM-DD)' },
            { status: 400 }
          );
        }
        updates.push(`attendance_list_deadline = $${paramIndex++}`);
        values.push(`${attendance_list_deadline}T23:59:59.999Z`);
      } else {
        updates.push(`attendance_list_deadline = $${paramIndex++}`);
        values.push(null);
      }
    }

    if (attendance_list_require_rg !== undefined) {
      updates.push(`attendance_list_require_rg = $${paramIndex++}`);
      values.push(Boolean(attendance_list_require_rg));
    }
    if (attendance_list_limit !== undefined) {
      if (attendance_list_limit == null) {
        updates.push(`attendance_list_limit = $${paramIndex++}`);
        values.push(null);
      } else {
        const parsed = Number(attendance_list_limit);
        if (!Number.isInteger(parsed) || parsed < 1) {
          return NextResponse.json(
            { error: 'O limite de inscrições deve ser um número inteiro maior que zero' },
            { status: 400 }
          );
        }
        updates.push(`attendance_list_limit = $${paramIndex++}`);
        values.push(parsed);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    values.push(id);
    const result = await query(
      `UPDATE meetings SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar reunião:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar reunião' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/meetings/[id]
 * Removes a meeting from the group. Leaders and secretaries can delete meetings.
 */
export async function DELETE(
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

    const { id } = await params;

    const existing = await queryOne<{ id: string; group_id: string }>(
      `SELECT id, group_id FROM meetings WHERE id = $1`,
      [id]
    );

    if (!existing || existing.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    await query(`DELETE FROM meetings WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover reunião:', error);
    return NextResponse.json(
      { error: 'Erro ao remover reunião' },
      { status: 500 }
    );
  }
}
