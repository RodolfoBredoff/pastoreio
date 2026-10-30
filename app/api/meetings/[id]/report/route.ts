import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryOne } from '@/lib/db/postgres';
import { canManageMeetings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';

const MAX_TEXT = 4000;

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, MAX_TEXT);
  return t || null;
}

/**
 * PUT /api/meetings/[id]/report
 * Salva o relatório do encontro: pedidos de oração (privados), oferta e observações.
 * Body: { prayer_requests?: string, offering?: number | string | null, notes?: string }
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }
    if (!canManageMeetings(leader.role)) {
      return NextResponse.json({ error: SECRETARY_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const { id } = await params;
    const meeting = await queryOne<{ group_id: string }>(`SELECT group_id FROM meetings WHERE id = $1`, [id]);
    if (!meeting || meeting.group_id !== leader.group_id) {
      return NextResponse.json({ error: 'Encontro não encontrado' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    let offering: number | null = null;
    if (body.offering !== undefined && body.offering !== null && String(body.offering).trim() !== '') {
      const n = Number(String(body.offering).replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 10_000_000) {
        return NextResponse.json({ error: 'Valor de oferta inválido' }, { status: 400 });
      }
      offering = Math.round(n * 100) / 100;
    }

    const updated = await queryOne<{
      report_prayer_requests: string | null;
      report_offering: string | null;
      report_notes: string | null;
      report_updated_at: string;
    }>(
      `UPDATE meetings
       SET report_prayer_requests = $2, report_offering = $3, report_notes = $4, report_updated_at = NOW()
       WHERE id = $1
       RETURNING report_prayer_requests, report_offering, report_notes, report_updated_at`,
      [id, cleanText(body.prayer_requests), offering, cleanText(body.notes)]
    );

    return NextResponse.json({ ok: true, report: updated });
  } catch (error) {
    console.error('Erro ao salvar relatório do encontro:', error);
    return NextResponse.json({ error: 'Erro ao salvar relatório' }, { status: 500 });
  }
}
