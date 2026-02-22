import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import { query, queryMany } from '@/lib/db/postgres';
import { validatePassword, PASSWORD_REQUIREMENTS_TEXT } from '@/lib/auth/password-validation';
import bcrypt from 'bcryptjs';

/**
 * GET /api/admin/leaders
 * Lista todos os líderes com seus grupos
 */
export async function GET() {
  try {
    await requireAdmin();

    const leaders = await queryMany<{
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      group_id: string | null;
      group_name: string | null;
      organization_name: string | null;
      created_at: string;
    }>(
      `SELECT 
        l.id, l.full_name, l.email, l.phone,
        l.group_id, g.name as group_name,
        o.name as organization_name,
        l.created_at
       FROM leaders l
       LEFT JOIN groups g ON g.id = l.group_id
       LEFT JOIN organizations o ON o.id = l.organization_id
       ORDER BY l.full_name ASC`
    );

    return NextResponse.json(leaders);
  } catch (error) {
    console.error('Erro ao listar líderes:', error);
    return NextResponse.json({ error: 'Erro ao listar líderes' }, { status: 500 });
  }
}

/**
 * POST /api/admin/leaders
 * Cria um novo líder (e o usuário correspondente)
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();

    const { full_name, email, phone, organization_id, group_id, role, password } =
      await request.json();

    if (!full_name || !email || !organization_id) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: full_name, email, organization_id' },
        { status: 400 }
      );
    }

    const leaderRole = ['leader', 'secretary', 'coordinator'].includes(role) ? role : 'leader';
    const resolvedGroupId = leaderRole === 'coordinator' ? null : (group_id || null);

    if (password) {
      const validation = validatePassword(password);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.message ?? PASSWORD_REQUIREMENTS_TEXT },
          { status: 400 }
        );
      }
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const userResult = await query(
      `INSERT INTO users (email, email_verified, password_hash, must_change_password)
       VALUES ($1, TRUE, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         email_verified = TRUE,
         password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
         must_change_password = CASE WHEN EXCLUDED.password_hash IS NOT NULL THEN TRUE ELSE users.must_change_password END
       RETURNING id`,
      [email.toLowerCase().trim(), passwordHash, !!passwordHash]
    );

    const userId = userResult.rows[0].id;

    // Criar líder
    const leaderResult = await query(
      `INSERT INTO leaders (id, organization_id, group_id, full_name, email, phone, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         phone = EXCLUDED.phone,
         group_id = EXCLUDED.group_id,
         role = EXCLUDED.role
       RETURNING *`,
      [userId, organization_id, resolvedGroupId, full_name, email.toLowerCase().trim(), phone || null, leaderRole]
    );

    return NextResponse.json(leaderResult.rows[0], { status: 201 });
  } catch (error) {
    console.error('Erro ao criar líder:', error);
    return NextResponse.json({ error: 'Erro ao criar líder' }, { status: 500 });
  }
}
