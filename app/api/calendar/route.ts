import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, queryOne } from '@/lib/db/postgres';
import { generateICS } from '@/lib/calendar/ics';

/**
 * GET /api/calendar?scope=upcoming|all
 * Retorna arquivo .ics com os encontros do grupo.
 * Funciona com Google Calendar, Apple Calendar e Outlook.
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') ?? 'upcoming';

    const group = await queryOne<{ name: string }>(
      `SELECT name FROM groups WHERE id = $1`,
      [leader.group_id]
    );

    const groupName = group?.name ?? 'Meu Grupo';

    let meetings;
    if (scope === 'all') {
      meetings = await queryMany<{
        id: string;
        meeting_date: string;
        meeting_time: string | null;
        title: string | null;
        notes: string | null;
        location: string | null;
      }>(
        `SELECT id, meeting_date, meeting_time, title, notes, location
         FROM meetings
         WHERE group_id = $1 AND is_cancelled = FALSE
         ORDER BY meeting_date ASC
         LIMIT 365`,
        [leader.group_id]
      );
    } else {
      meetings = await queryMany<{
        id: string;
        meeting_date: string;
        meeting_time: string | null;
        title: string | null;
        notes: string | null;
        location: string | null;
      }>(
        `SELECT id, meeting_date, meeting_time, title, notes, location
         FROM meetings
         WHERE group_id = $1 AND is_cancelled = FALSE
           AND meeting_date >= CURRENT_DATE
         ORDER BY meeting_date ASC
         LIMIT 52`,
        [leader.group_id]
      );
    }

    const icsContent = generateICS(meetings, groupName);

    return new Response(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="agenda-${groupName.replace(/[^a-zA-Z0-9]/g, '-')}.ics"`,
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (error) {
    console.error('Erro ao gerar calendário:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
