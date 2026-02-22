import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryOne, query } from '@/lib/db/postgres';
import { validatePassword, PASSWORD_REQUIREMENTS_TEXT } from '@/lib/auth/password-validation';
import bcrypt from 'bcryptjs';

/**
 * POST /api/auth/change-password
 * Altera a senha do usuário autenticado (líder, secretário ou coordenador).
 * Se must_change_password = true, não exige senha atual. Caso contrário, exige.
 * Nova senha: mais de 10 caracteres, uma maiúscula, uma minúscula e um número.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { current_password, new_password } = await request.json();

    if (!new_password || typeof new_password !== 'string') {
      return NextResponse.json({ error: 'Nova senha é obrigatória' }, { status: 400 });
    }

    const validation = validatePassword(new_password);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message ?? PASSWORD_REQUIREMENTS_TEXT }, { status: 400 });
    }

    const user = await queryOne<{ id: string; password_hash: string | null; must_change_password: boolean | null }>(
      `SELECT id, password_hash, must_change_password FROM users WHERE id = $1`,
      [session.id]
    );

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const mustChange = user.must_change_password === true;

    if (!mustChange && user.password_hash) {
      if (!current_password || typeof current_password !== 'string') {
        return NextResponse.json({ error: 'Senha atual é obrigatória' }, { status: 400 });
      }
      const matches = await bcrypt.compare(current_password, user.password_hash);
      if (!matches) {
        return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 });
      }
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`,
      [newHash, user.id]
    );

    return NextResponse.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return NextResponse.json({ error: 'Erro ao alterar senha' }, { status: 500 });
  }
}
