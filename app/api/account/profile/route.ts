import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query } from '@/lib/db/postgres';

/**
 * PUT /api/account/profile
 * Atualiza nome e/ou telefone do líder autenticado.
 */
export async function PUT(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader) {
      return NextResponse.json({ error: 'Líder não encontrado.' }, { status: 404 });
    }

    const body = await request.json();
    const fullName: string | undefined = body.full_name?.trim();
    const phone: string | undefined = body.phone?.trim();

    if (fullName !== undefined && fullName.length < 2) {
      return NextResponse.json({ error: 'Nome muito curto.' }, { status: 400 });
    }

    // Normalizar telefone: aceita vazio (remove), ou número com pelo menos 8 dígitos
    const normalizedPhone =
      phone === '' || phone === undefined
        ? null
        : phone.replace(/\D/g, '').length >= 8
        ? phone
        : null;

    if (phone !== undefined && phone !== '' && normalizedPhone === null) {
      return NextResponse.json(
        { error: 'Telefone inválido. Informe o número com DDD (ex: 11 99999-9999).' },
        { status: 400 }
      );
    }

    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (fullName !== undefined) {
      updates.push(`full_name = $${values.length + 1}`);
      values.push(fullName);
    }

    if (phone !== undefined) {
      updates.push(`phone = $${values.length + 1}`);
      values.push(normalizedPhone);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 });
    }

    values.push(leader.id);
    await query(
      `UPDATE leaders SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Profile] Erro ao atualizar perfil:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
