import { NextResponse } from 'next/server';
import { requireCoordinator } from '@/lib/auth/coordinator-session';
import { query, queryMany } from '@/lib/db/postgres';
import { validatePassword, PASSWORD_REQUIREMENTS_TEXT } from '@/lib/auth/password-validation';
import bcrypt from 'bcryptjs';

/**
 * GET /api/coordinator/leaders
 * Returns all leaders and secretaries in the coordinator's organization.
 */
export async function GET() {
  try {
    const coordinator = await requireCoordinator();

    const leaders = await queryMany<{
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      role: string;
      group_id: string | null;
      group_name: string | null;
      created_at: string;
    }>(
      `SELECT l.id, l.full_name, l.email, l.phone, l.role, l.group_id,
              g.name as group_name, l.created_at
       FROM leaders l
       LEFT JOIN groups g ON g.id = l.group_id
       WHERE l.organization_id = $1 AND l.role IN ('leader','secretary')
       ORDER BY l.full_name ASC`,
      [coordinator.organization_id]
    );

    return NextResponse.json(leaders);
  } catch (error) {
    console.error('Erro ao listar líderes:', error);
    return NextResponse.json({ error: 'Acesso negado ou erro interno' }, { status: 403 });
  }
}

/**
 * POST /api/coordinator/leaders
 * Creates a new leader or secretary in the coordinator's organization.
 */
export async function POST(request: Request) {
  try {
    const coordinator = await requireCoordinator();
    const { full_name, email, phone, group_id, role, password } = await request.json();

    if (!full_name || !email) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: full_name, email' },
        { status: 400 }
      );
    }

    const leaderRole = role === 'secretary' ? 'secretary' : 'leader';

    if (password) {
      const validation = validatePassword(password);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.message ?? PASSWORD_REQUIREMENTS_TEXT },
          { status: 400 }
        );
      }
    }

    if (group_id) {
      const groupCheck = await query(
        `SELECT id FROM groups WHERE id = $1 AND organization_id = $2`,
        [group_id, coordinator.organization_id]
      );
      if (groupCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Grupo não pertence à sua organização' }, { status: 403 });
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

    const leaderResult = await query(
      `INSERT INTO leaders (id, organization_id, group_id, full_name, email, phone, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         phone = EXCLUDED.phone,
         group_id = EXCLUDED.group_id,
         role = EXCLUDED.role
       RETURNING *`,
      [userId, coordinator.organization_id, group_id || null, full_name, email.toLowerCase().trim(), phone || null, leaderRole]
    );

    return NextResponse.json(leaderResult.rows[0], { status: 201 });
  } catch (error) {
    console.error('Erro ao criar líder:', error);
    return NextResponse.json({ error: 'Erro ao criar líder' }, { status: 500 });
  }
}
