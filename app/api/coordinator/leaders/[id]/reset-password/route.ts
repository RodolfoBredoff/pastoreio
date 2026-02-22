import { NextResponse } from 'next/server';
import { requireCoordinator } from '@/lib/auth/coordinator-session';
import { queryOne, query } from '@/lib/db/postgres';
import { validatePassword, generateRandomPassword, PASSWORD_REQUIREMENTS_TEXT } from '@/lib/auth/password-validation';
import bcrypt from 'bcryptjs';

/**
 * POST /api/coordinator/leaders/[id]/reset-password
 * Redefine a senha de um líder/secretário da organização. Apenas coordenador.
 * Body: { password?: string } — se omitido, gera senha aleatória.
 * O usuário precisará trocar a senha no próximo login (must_change_password = true).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const coordinator = await requireCoordinator();
    const { id } = await params;

    const leader = await queryOne<{ id: string }>(
      `SELECT id FROM leaders WHERE id = $1 AND organization_id = $2 AND role IN ('leader','secretary')`,
      [id, coordinator.organization_id]
    );
    if (!leader) {
      return NextResponse.json({ error: 'Líder/secretário não encontrado na sua organização' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const passwordInput = body.password?.trim();
    const password = passwordInput || generateRandomPassword();

    if (passwordInput) {
      const validation = validatePassword(passwordInput);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.message ?? PASSWORD_REQUIREMENTS_TEXT },
          { status: 400 }
        );
      }
    }

    const hash = await bcrypt.hash(password, 10);
    await query(
      `UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2`,
      [hash, id]
    );

    const res: { success: true; message: string; temporary_password?: string } = {
      success: true,
      message: 'Senha redefinida. O usuário deverá alterá-la no próximo login.',
    };
    if (!passwordInput) {
      res.temporary_password = password;
    }
    return NextResponse.json(res);
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return NextResponse.json({ error: 'Erro ao redefinir senha' }, { status: 500 });
  }
}
