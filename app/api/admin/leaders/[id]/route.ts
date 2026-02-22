import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import { query, queryOne } from '@/lib/db/postgres';
import { validatePassword, PASSWORD_REQUIREMENTS_TEXT } from '@/lib/auth/password-validation';
import bcrypt from 'bcryptjs';

/**
 * PUT /api/admin/leaders/[id]
 * Atualiza dados de um líder
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const data = await request.json();

    const { full_name, phone, group_id, password } = data;

    // Atualizar líder
    const leaderUpdates: string[] = [];
    const leaderValues: unknown[] = [];
    let i = 1;

    if (full_name !== undefined) { leaderUpdates.push(`full_name = $${i++}`); leaderValues.push(full_name); }
    if (phone !== undefined) { leaderUpdates.push(`phone = $${i++}`); leaderValues.push(phone || null); }
    if (group_id !== undefined) { leaderUpdates.push(`group_id = $${i++}`); leaderValues.push(group_id || null); }

    if (leaderUpdates.length > 0) {
      leaderValues.push(id);
      await query(
        `UPDATE leaders SET ${leaderUpdates.join(', ')} WHERE id = $${i}`,
        leaderValues
      );
    }

    if (password) {
      const validation = validatePassword(password);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.message ?? PASSWORD_REQUIREMENTS_TEXT },
          { status: 400 }
        );
      }
      const hash = await bcrypt.hash(password, 10);
      await query(
        `UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2`,
        [hash, id]
      );
    }

    const updated = await queryOne(
      `SELECT l.*, g.name as group_name
       FROM leaders l
       LEFT JOIN groups g ON g.id = l.group_id
       WHERE l.id = $1`,
      [id]
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar líder:', error);
    return NextResponse.json({ error: 'Erro ao atualizar líder' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/leaders/[id]
 * Remove um líder (e desvincula o grupo)
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    // Desvincular do grupo antes de remover
    await query(`UPDATE leaders SET group_id = NULL WHERE id = $1`, [id]);
    await query(`DELETE FROM leaders WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover líder:', error);
    return NextResponse.json({ error: 'Erro ao remover líder' }, { status: 500 });
  }
}
