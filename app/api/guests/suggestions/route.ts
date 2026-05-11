import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';

interface GuestSuggestion {
  id: string;
  full_name: string;
  phone: string | null;
  appearances: string;
  last_appearance: string;
}

/**
 * GET /api/guests/suggestions?q=term
 * Retorna sugestões de visitantes não cadastrados que já apareceram anteriormente
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
    const query_term = searchParams.get('q') || '';

    if (query_term.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    // Buscar visitantes não cadastrados que já apareceram anteriormente
    const suggestions = await queryMany<GuestSuggestion>(
      `SELECT 
        gv.id,
        gv.full_name,
        gv.phone,
        COUNT(DISTINCT ag.meeting_id)::text as appearances,
        MAX(m.meeting_date)::text as last_appearance
       FROM guest_visitors gv
       INNER JOIN attendance_guests ag ON ag.guest_id = gv.id
       INNER JOIN meetings m ON m.id = ag.meeting_id
       WHERE gv.group_id = $1
         AND LOWER(gv.full_name) LIKE LOWER($2)
       GROUP BY gv.id, gv.full_name, gv.phone
       ORDER BY MAX(m.meeting_date) DESC, gv.full_name ASC
       LIMIT 10`,
      [leader.group_id, `%${query_term}%`]
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Erro ao buscar sugestões:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar sugestões' },
      { status: 500 }
    );
  }
}
