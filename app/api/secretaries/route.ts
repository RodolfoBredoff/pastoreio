import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query, queryMany, queryOne } from '@/lib/db/postgres';
import { canManageSecretaries, SECRETARY_FORBIDDEN_MESSAGE } from '@/lib/auth/permissions';
import { validatePassword, generateRandomPassword } from '@/lib/auth/password-validation';
import bcrypt from 'bcryptjs';

/**
 * GET /api/secretaries
 * Lista os secretários do grupo do líder atual.
 */
export async function GET() {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não está vinculado a um grupo' }, { status: 400 });
    }

    if (!canManageSecretaries(leader.role)) {
      return NextResponse.json({ error: SECRETARY_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const secretaries = await queryMany<{
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      created_at: string;
    }>(
      `SELECT id, full_name, email, phone, created_at
       FROM leaders
       WHERE group_id = $1 AND role = 'secretary'
       ORDER BY full_name ASC`,
      [leader.group_id]
    );

    return NextResponse.json(secretaries);
  } catch (error) {
    console.error('Erro ao listar secretários:', error);
    return NextResponse.json({ error: 'Erro ao listar secretários' }, { status: 500 });
  }
}

/**
 * POST /api/secretaries
 * Cria um secretário para o grupo do líder atual.
 * Cria uma conta de usuário se o e-mail ainda não existir.
 */
export async function POST(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não está vinculado a um grupo' }, { status: 400 });
    }

    if (!canManageSecretaries(leader.role)) {
      return NextResponse.json({ error: SECRETARY_FORBIDDEN_MESSAGE }, { status: 403 });
    }

    const body = await request.json() as {
      full_name: string;
      email: string;
      phone?: string;
      password?: string;
      generate_password?: boolean;
    };
    const { full_name, email, phone, password: passwordInput, generate_password } = body;

    if (!full_name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Nome e e-mail são obrigatórios' }, { status: 400 });
    }

    const password = generate_password ? generateRandomPassword() : (passwordInput?.trim() || '');
    if (!password) {
      return NextResponse.json(
        { error: 'Informe uma senha para o primeiro acesso ou marque "Gerar senha aleatória".' },
        { status: 400 }
      );
    }
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json({ error: passwordValidation.message }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verificar se já existe um secretário com esse e-mail neste grupo
    const existing = await queryOne<{ id: string }>(
      `SELECT l.id FROM leaders l
       WHERE l.email = $1 AND l.group_id = $2`,
      [normalizedEmail, leader.group_id]
    );

    if (existing) {
      return NextResponse.json(
        { error: 'Já existe um secretário ou líder com este e-mail neste grupo.' },
        { status: 409 }
      );
    }

    // Criar ou reutilizar conta de usuário
    let userId: string;
    const existingUser = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [normalizedEmail]
    );

    const passwordHash = await bcrypt.hash(password, 10);

    if (existingUser) {
      const alreadyLeader = await queryOne<{ id: string }>(
        `SELECT id FROM leaders WHERE id = $1`,
        [existingUser.id]
      );
      if (alreadyLeader) {
        return NextResponse.json(
          { error: 'Este e-mail já está associado a outro grupo como líder ou secretário.' },
          { status: 409 }
        );
      }
      userId = existingUser.id;
      await query(
        `UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2`,
        [passwordHash, userId]
      );
    } else {
      const newUser = await queryOne<{ id: string }>(
        `INSERT INTO users (email, email_verified, password_hash, must_change_password)
         VALUES ($1, TRUE, $2, TRUE) RETURNING id`,
        [normalizedEmail, passwordHash]
      );
      if (!newUser) throw new Error('Falha ao criar usuário');
      userId = newUser.id;
    }

    const secretary = await queryOne(
      `INSERT INTO leaders (id, organization_id, group_id, full_name, email, phone, role)
       VALUES ($1, $2, $3, $4, $5, $6, 'secretary')
       RETURNING id, full_name, email, phone, role, created_at`,
      [userId, leader.organization_id, leader.group_id, full_name.trim(), normalizedEmail, phone?.trim() || null]
    );

    const response: Record<string, unknown> = { ...secretary };
    if (generate_password) {
      response.temporary_password = password;
    }
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar secretário:', error);
    return NextResponse.json({ error: 'Erro ao criar secretário' }, { status: 500 });
  }
}
