import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query } from '@/lib/db/postgres';
import { canManageSettings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';

/**
 * PUT /api/groups/settings
 * Atualiza as configurações padrão do grupo do líder (dia e horário)
 */
export async function PUT(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json(
        { error: 'Líder não está vinculado a um grupo' },
        { status: 400 }
      );
    }

    if (!canManageSettings(leader.role)) {
      return NextResponse.json({ error: SECRETARY_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const data = await request.json();
    const {
      default_meeting_day,
      default_meeting_time,
      reminder_enabled,
      absence_whatsapp_enabled,
      weekly_summary_enabled,
    } = data;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (default_meeting_day !== undefined) {
      const day = parseInt(default_meeting_day);
      if (isNaN(day) || day < 0 || day > 6) {
        return NextResponse.json(
          { error: 'Dia da semana inválido (0-6)' },
          { status: 400 }
        );
      }
      updates.push(`default_meeting_day = $${paramIndex++}`);
      values.push(day);
    }

    if (default_meeting_time !== undefined) {
      if (!/^\d{2}:\d{2}$/.test(default_meeting_time)) {
        return NextResponse.json(
          { error: 'Horário inválido (use o formato HH:MM)' },
          { status: 400 }
        );
      }
      updates.push(`default_meeting_time = $${paramIndex++}`);
      values.push(default_meeting_time);
    }

    if (reminder_enabled !== undefined) {
      updates.push(`reminder_enabled = $${paramIndex++}`);
      values.push(Boolean(reminder_enabled));
    }

    if (absence_whatsapp_enabled !== undefined) {
      updates.push(`absence_whatsapp_enabled = $${paramIndex++}`);
      values.push(Boolean(absence_whatsapp_enabled));
    }

    if (weekly_summary_enabled !== undefined) {
      updates.push(`weekly_summary_enabled = $${paramIndex++}`);
      values.push(Boolean(weekly_summary_enabled));
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    values.push(leader.group_id);
    const result = await query(
      `UPDATE groups SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar configurações do grupo:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar configurações' },
      { status: 500 }
    );
  }
}
