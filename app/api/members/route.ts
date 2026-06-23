import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { query } from '@/lib/db/postgres';

/**
 * GET /api/members
 * Busca membros por IDs ou filtros de período
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json(
        { error: 'Líder não está vinculado a um grupo' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');
    const createdAfter = searchParams.get('created_after');
    const createdBefore = searchParams.get('created_before');
    const memberFilter = searchParams.get('member_filter') || 'all';

    // Se IDs foram passados, usar query simplificada
    if (ids) {
      const idArray = ids.split(',').filter(id => id.trim());
      
      if (idArray.length === 0) {
        return NextResponse.json([]);
      }

      // Query simplificada para buscar por IDs
      const placeholders = idArray.map((_, i) => `$${i + 2}`).join(',');
      const sql = `
        SELECT 
          m.id, 
          m.full_name, 
          m.phone, 
          m.member_type,
          m.status,
          m.created_at,
          COALESCE((
            SELECT ROUND(COUNT(CASE WHEN a.is_present THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0))::INTEGER
            FROM attendance a
            JOIN meetings mt ON a.meeting_id = mt.id
            WHERE a.member_id = m.id 
              AND mt.group_id = m.group_id
              AND mt.meeting_date >= CURRENT_DATE - INTERVAL '90 days'
              AND mt.is_cancelled = FALSE
          ), 0) as frequency_rate
        FROM members m
        WHERE m.group_id = $1
          AND m.id IN (${placeholders})
        ORDER BY m.full_name
      `;
      
      const result = await query(sql, [leader.group_id, ...idArray]);
      return NextResponse.json(result.rows);
    }

    // Query para buscar por período (cohorts)
    let sql = `
      SELECT 
        m.id, 
        m.full_name, 
        m.phone, 
        m.member_type,
        m.status,
        m.created_at,
        COALESCE((
          SELECT ROUND(COUNT(CASE WHEN a.is_present THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0))::INTEGER
          FROM attendance a
          JOIN meetings mt ON a.meeting_id = mt.id
          WHERE a.member_id = m.id 
            AND mt.group_id = m.group_id
            AND mt.meeting_date >= CURRENT_DATE - INTERVAL '90 days'
            AND mt.is_cancelled = FALSE
        ), 0) as frequency_rate
      FROM members m
      WHERE m.group_id = $1
    `;
    
    const params: any[] = [leader.group_id];
    let paramIndex = 2;

    // Filtro por período de criação
    if (createdAfter) {
      sql += ` AND m.created_at >= $${paramIndex}`;
      params.push(createdAfter);
      paramIndex++;
    }
    
    if (createdBefore) {
      sql += ` AND m.created_at <= $${paramIndex}`;
      params.push(createdBefore);
      paramIndex++;
    }

    // Filtro por tipo de membro
    if (memberFilter === 'members' || memberFilter === 'participants') {
      sql += ` AND m.member_type = 'participant'`;
    } else if (memberFilter === 'visitors') {
      sql += ` AND m.member_type = 'visitor'`;
    }

    sql += ` ORDER BY m.full_name`;

    const result = await query(sql, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar membros:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar membros' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/members
 * Cria um novo membro. O campo birth_date é opcional.
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

    const data = await request.json();
    const { full_name, phone, birth_date, member_type } = data;

    if (!full_name || !phone || !member_type) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: full_name, phone, member_type' },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO members (group_id, full_name, phone, birth_date, member_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [leader.group_id, full_name, phone, birth_date || null, member_type]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Erro ao criar membro:', error);
    return NextResponse.json(
      { error: 'Erro ao criar membro' },
      { status: 500 }
    );
  }
}
