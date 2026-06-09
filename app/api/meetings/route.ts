import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryMany } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 60);
}

function shortId(): string {
  // 4 chars, URL-friendly, enough to avoid casual collisions
  return Math.random().toString(36).slice(2, 6);
}

/**
 * GET /api/meetings
 * Lista reuniões do grupo (passadas por padrão) para filtros, ex.: mensagem em grupo por encontro.
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json([], { status: 200 });
    }
    const { searchParams } = new URL(request.url);
    const past = searchParams.get('past');
    const limit = Math.min(Number(searchParams.get('limit')) || 30, 100);
    const onlyPast = past !== '0' && past !== 'false';
    const rows = await queryMany<{ id: string; meeting_date: string; title: string | null }>(
      onlyPast
        ? `SELECT id, meeting_date, title FROM meetings
           WHERE group_id = $1 AND is_cancelled = FALSE AND meeting_date <= CURRENT_DATE
           ORDER BY meeting_date DESC LIMIT $2`
        : `SELECT id, meeting_date, title FROM meetings
           WHERE group_id = $1 AND is_cancelled = FALSE
           ORDER BY meeting_date DESC LIMIT $2`,
      [leader.group_id, limit]
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Erro ao listar reuniões:', error);
    return NextResponse.json([], { status: 200 });
  }
}

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
      attendance_list_mode,
      attendance_list_slug,
      attendance_list_require_rg,
      attendance_list_limit,
    } = data as {
      meeting_date: string;
      meeting_time?: string | null;
      title?: string | null;
      notes?: string | null;
      meeting_type?: 'regular' | 'special_event';
      location?: string | null;
      generate_attendance_list?: boolean;
      attendance_list_deadline?: string | null;
      attendance_list_mode?: 'prefilled' | 'open';
      attendance_list_slug?: string | null;
      attendance_list_require_rg?: boolean;
      attendance_list_limit?: number | null;
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
    const attendanceListMode: 'prefilled' | 'open' =
      withList && attendance_list_mode === 'open' ? 'open' : 'prefilled';
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

    const attendanceListRequireRg =
      withList && attendance_list_mode === 'open' && Boolean(attendance_list_require_rg);
    let attendanceListLimit: number | null = null;
    if (withList && attendance_list_limit != null) {
      const parsed = Number(attendance_list_limit);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return NextResponse.json(
          { error: 'O limite de inscrições deve ser um número inteiro maior que zero' },
          { status: 400 }
        );
      }
      attendanceListLimit = parsed;
    }

    let attendanceListSlug: string | null = null;
    if (withList) {
      const provided = typeof attendance_list_slug === 'string' ? attendance_list_slug.trim() : '';
      const baseTitle = (title && String(title).trim()) ? String(title).trim() : 'encontro';
      const base = provided ? slugify(provided) : slugify(baseTitle);
      const datePart = meeting_date.replaceAll('-', '');
      const candidateBase = `${base || 'encontro'}-${datePart}`.slice(0, 60);
      attendanceListSlug = `${candidateBase}-${shortId()}`.replace(/-+/g, '-');
    }

    const result = await query(
      `INSERT INTO meetings (group_id, meeting_date, meeting_time, title, notes, meeting_type, is_cancelled, location, attendance_list_token, attendance_list_deadline, attendance_list_slug, attendance_list_mode, attendance_list_require_rg, attendance_list_limit)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8, $9, $10, $11, $12, $13)
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
        attendanceListSlug,
        attendanceListMode,
        attendanceListRequireRg,
        attendanceListLimit,
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
