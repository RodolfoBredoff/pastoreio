import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryOne } from '@/lib/db/postgres';
import { canManageSettings, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { randomBytes } from 'crypto';

/**
 * GET /api/groups/engagement-share
 * Retorna se o engajamento está público e a URL pública (se habilitado).
 */
export async function GET() {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }

    const row = await queryOne<{ engagement_share_enabled: boolean; engagement_share_token: string | null }>(
      `SELECT engagement_share_enabled, engagement_share_token FROM groups WHERE id = $1`,
      [leader.group_id]
    );

    if (!row) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const publicUrl =
      row.engagement_share_enabled && row.engagement_share_token
        ? `${baseUrl}/engajamento/public/${row.engagement_share_token}`
        : null;

    return NextResponse.json({
      enabled: row.engagement_share_enabled === true,
      publicUrl: publicUrl ?? undefined,
    });
  } catch (error) {
    console.error('Erro ao buscar configuração de compartilhamento:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * PUT /api/groups/engagement-share
 * Body: { enabled: boolean }
 * Ativa ou desativa a página de engajamento pública. Ao ativar, gera token se ainda não existir.
 */
export async function PUT(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }
    if (!canManageSettings(leader.role)) {
      return NextResponse.json({ error: SECRETARY_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const body = await request.json();
    const enabled = body.enabled === true;

    const current = await queryOne<{ engagement_share_token: string | null }>(
      `SELECT engagement_share_token FROM groups WHERE id = $1`,
      [leader.group_id]
    );
    if (!current) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
    }

    let token = current.engagement_share_token;
    if (enabled && !token) {
      token = randomBytes(16).toString('hex');
      await query(
        `UPDATE groups SET engagement_share_token = $1, updated_at = NOW() WHERE id = $2`,
        [token, leader.group_id]
      );
    }

    await query(
      `UPDATE groups SET engagement_share_enabled = $1, updated_at = NOW() WHERE id = $2`,
      [enabled, leader.group_id]
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const publicUrl = enabled && token ? `${baseUrl}/engajamento/public/${token}` : null;

    return NextResponse.json({ enabled, publicUrl: publicUrl ?? undefined });
  } catch (error) {
    console.error('Erro ao atualizar compartilhamento de engajamento:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}
