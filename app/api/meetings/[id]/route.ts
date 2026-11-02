import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryOne, queryMany } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { normalizeExtraFieldConfigs, type ExtraFieldConfigInput } from '@/lib/attendance-list-extra';
import { scheduleAttendanceSnapshotSync } from '@/lib/attendance-snapshot';
import {
  countRecordedConfirmations,
  extraFieldHasAnswers,
  generateListIdentifiers,
  normalizePaidConfig,
} from '@/lib/attendance-list-setup';

function toDateOnly(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
}

/**
 * PUT /api/meetings/[id]
 * Updates a meeting. Leaders and secretaries can edit meetings.
 * Editing the list configuration never changes or deletes confirmations already recorded.
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

    const existing = await queryOne<{
      id: string;
      group_id: string;
      meeting_date: string;
      title: string | null;
      meeting_type: 'regular' | 'special_event';
      attendance_list_token: string | null;
      attendance_list_mode: 'prefilled' | 'open' | null;
      is_paid_event: boolean;
      payment_pix_key: string | null;
    }>(
      `SELECT id, group_id, meeting_date, title, meeting_type, attendance_list_token,
              COALESCE(attendance_list_mode, 'prefilled') AS attendance_list_mode,
              COALESCE(is_paid_event, FALSE) AS is_paid_event, payment_pix_key
       FROM meetings WHERE id = $1`,
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
      attendance_list_extra_fields,
      generate_attendance_list,
      attendance_list_mode,
      is_paid_event,
      payment_pix_key,
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
      attendance_list_extra_fields?: unknown;
      generate_attendance_list?: boolean;
      attendance_list_mode?: 'prefilled' | 'open';
      is_paid_event?: boolean;
      payment_pix_key?: string | null;
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

    // ------------------------------------------------------------------
    // Configuração da lista (totalmente editável pelo líder).
    // Nada aqui altera ou apaga confirmações já registradas: só mexemos na tabela
    // meetings e na configuração dos campos adicionais. Validações vêm antes de qualquer escrita.
    // ------------------------------------------------------------------
    const recordedConfirmations = await countRecordedConfirmations(id);
    let listToken = existing.attendance_list_token;
    const effectiveType = meeting_type ?? existing.meeting_type;

    // Ativar a lista pública em um encontro especial que ainda não tem
    if (generate_attendance_list === true && !listToken) {
      if (effectiveType !== 'special_event') {
        return NextResponse.json(
          { error: 'A lista de presença só pode ser gerada em Agenda Especial / Evento' },
          { status: 400 }
        );
      }
      const ids = generateListIdentifiers({
        title: title !== undefined ? title : existing.title,
        meetingDate: toDateOnly(meeting_date ?? existing.meeting_date),
        preferredSlugBase: null,
      });
      listToken = ids.token;
      updates.push(`attendance_list_token = $${paramIndex++}`);
      values.push(ids.token);
      updates.push(`attendance_list_slug = $${paramIndex++}`);
      values.push(ids.slug);
    }

    const wantsListSettings =
      attendance_list_mode !== undefined ||
      is_paid_event !== undefined ||
      payment_pix_key !== undefined ||
      attendance_list_extra_fields !== undefined;
    if (wantsListSettings && !listToken) {
      return NextResponse.json({ error: 'Este encontro não possui lista de presença' }, { status: 400 });
    }

    // Tipo da lista: trocar entre pré-preenchida e vazia esconderia as confirmações já feitas
    let finalMode = existing.attendance_list_mode ?? 'prefilled';
    if (attendance_list_mode !== undefined) {
      if (attendance_list_mode !== 'prefilled' && attendance_list_mode !== 'open') {
        return NextResponse.json({ error: 'Tipo de lista inválido' }, { status: 400 });
      }
      if (attendance_list_mode !== finalMode) {
        if (recordedConfirmations > 0) {
          return NextResponse.json(
            {
              error:
                'Não é possível trocar o tipo da lista depois que há confirmações registradas, pois elas ficariam ocultas. As demais configurações podem ser editadas normalmente.',
            },
            { status: 409 }
          );
        }
        finalMode = attendance_list_mode;
        updates.push(`attendance_list_mode = $${paramIndex++}`);
        values.push(attendance_list_mode);
      }
    }

    // Evento pago: chave PIX obrigatória; confirmações já feitas não são revalidadas
    if (is_paid_event !== undefined || payment_pix_key !== undefined) {
      const willBePaid = is_paid_event !== undefined ? Boolean(is_paid_event) : existing.is_paid_event;
      const keyInput = payment_pix_key !== undefined ? payment_pix_key : existing.payment_pix_key;
      const paid = normalizePaidConfig(willBePaid, keyInput);
      if (!paid.ok) {
        return NextResponse.json({ error: paid.error }, { status: 400 });
      }
      updates.push(`is_paid_event = $${paramIndex++}`);
      values.push(paid.isPaid);
      updates.push(`payment_pix_key = $${paramIndex++}`);
      values.push(paid.pixKey);
    }

    // Campos adicionais obrigatórios (edição da configuração pelo admin)
    let extraFieldsPayload: ExtraFieldConfigInput[] | null = null;
    if (attendance_list_extra_fields !== undefined) {
      const res = normalizeExtraFieldConfigs(attendance_list_extra_fields);
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      extraFieldsPayload = res.fields;
    }

    // Um campo que já tem respostas registradas não pode ser removido (as respostas
    // ficariam invisíveis). Renomear e editar opções continua permitido.
    if (extraFieldsPayload !== null) {
      const currentFields = await queryMany<{ id: string; label: string }>(
        `SELECT id, label FROM attendance_list_extra_fields WHERE meeting_id = $1`,
        [id]
      );
      const keep = new Set(extraFieldsPayload.map((f) => f.id).filter((v): v is string => Boolean(v)));
      const blocked: string[] = [];
      for (const f of currentFields) {
        if (keep.has(f.id)) continue;
        if (await extraFieldHasAnswers(id, f.id)) blocked.push(f.label);
      }
      if (blocked.length > 0) {
        return NextResponse.json(
          {
            error: `Não é possível remover o campo "${blocked.join('", "')}" porque já há confirmações com resposta nele. Você pode renomeá-lo ou editar as opções.`,
          },
          { status: 409 }
        );
      }
    }

    if (updates.length === 0 && extraFieldsPayload === null) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    if (updates.length > 0) {
      values.push(id);
      await query(
        `UPDATE meetings SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

    if (extraFieldsPayload !== null) {
      const existingRows = await queryMany<{ id: string }>(
        `SELECT id FROM attendance_list_extra_fields WHERE meeting_id = $1`,
        [id]
      );
      const existingIds = new Set(existingRows.map((r) => r.id));
      const keptIds = new Set<string>();

      for (let i = 0; i < extraFieldsPayload.length; i++) {
        const f = extraFieldsPayload[i];
        const optionsJson = f.options ? JSON.stringify(f.options) : null;
        if (f.id && existingIds.has(f.id)) {
          keptIds.add(f.id);
          await query(
            `UPDATE attendance_list_extra_fields
             SET label = $1, options = $2::jsonb, allow_custom = $3, position = $4
             WHERE id = $5 AND meeting_id = $6`,
            [f.label, optionsJson, f.allow_custom, i, f.id, id]
          );
        } else {
          const inserted = await queryOne<{ id: string }>(
            `INSERT INTO attendance_list_extra_fields (meeting_id, label, options, allow_custom, position)
             VALUES ($1, $2, $3::jsonb, $4, $5)
             RETURNING id`,
            [id, f.label, optionsJson, f.allow_custom, i]
          );
          if (inserted?.id) keptIds.add(inserted.id);
        }
      }

      // Remove campos que não estão mais na configuração
      for (const existingId of existingIds) {
        if (!keptIds.has(existingId)) {
          await query(
            `DELETE FROM attendance_list_extra_fields WHERE id = $1 AND meeting_id = $2`,
            [existingId, id]
          );
        }
      }
    }

    const updated = await queryOne<Record<string, unknown>>(
      `SELECT * FROM meetings WHERE id = $1`,
      [id]
    );
    if (updated?.attendance_list_token) scheduleAttendanceSnapshotSync(id);
    return NextResponse.json(updated);
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

    const existing = await queryOne<{
      id: string;
      group_id: string;
      attendance_list_slug: string | null;
      attendance_list_token: string | null;
    }>(
      `SELECT id, group_id, attendance_list_slug, attendance_list_token::text AS attendance_list_token
       FROM meetings WHERE id = $1`,
      [id]
    );

    if (!existing || existing.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
    }

    await query(`DELETE FROM meetings WHERE id = $1`, [id]);

    // Remove o snapshot público (o encontro não existe mais no banco)
    if (existing.attendance_list_token || existing.attendance_list_slug) {
      scheduleAttendanceSnapshotSync(id, [existing.attendance_list_slug, existing.attendance_list_token]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover reunião:', error);
    return NextResponse.json(
      { error: 'Erro ao remover reunião' },
      { status: 500 }
    );
  }
}
