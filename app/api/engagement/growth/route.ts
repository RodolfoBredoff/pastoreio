import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, queryOne } from '@/lib/db/postgres';
import { parseTagFiltersJson } from '@/lib/member-tags-filter';
import { computeGrowthMetrics } from '@/lib/engagement-growth';

/**
 * GET /api/engagement/growth
 *
 * Métricas de crescimento/progressão do grupo, com linguagem simples:
 *  - Totais: pessoas já registradas (membros + visitantes únicos), membros
 *    ativos, convertidos, presentes pelo menos 1 vez.
 *  - Novas pessoas por encontro (primeira aparição de cada pessoa).
 *  - Por mês: novas pessoas, visitantes que voltaram e que viraram membros.
 *  - Presença por encontro (membros x visitantes).
 *  - "O grupo está crescendo?": média de presentes nos últimos 3 encontros
 *    vs 3 anteriores.
 *  - Frequência dos membros (assíduos/regulares/irregulares/afastados).
 *  - Visitantes novos que voltaram (%).
 *  - Total de pessoas ao longo do tempo (acumulado).
 *  - Filtro por tags (aplica-se às métricas de membros; visitantes não têm tags).
 *
 * Parâmetros:
 *  - months=3|6|12 (padrão 6): janela das séries temporais.
 *  - tags={"Chave":["valor", ...]}: filtro de tags (OR entre valores).
 *  - public_token / group_id: mesmas regras da rota /api/engagement.
 */

const MEETING_VISIBILITY = `(
  meeting_date <= CURRENT_DATE
  OR EXISTS (SELECT 1 FROM attendance a WHERE a.meeting_id = meetings.id)
  OR EXISTS (SELECT 1 FROM attendance_guests ag WHERE ag.meeting_id = meetings.id)
)`;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const publicToken = searchParams.get('public_token')?.trim() || null;
    const groupIdParam = searchParams.get('group_id');
    const monthsRaw = Number(searchParams.get('months')) || 6;
    const windowMonths = [3, 6, 12].includes(monthsRaw) ? monthsRaw : 6;
    const tags = parseTagFiltersJson(searchParams.get('tags'));

    // ── Autorização (mesmas regras de /api/engagement, simplificadas) ──
    let groupId: string | null = null;
    if (publicToken) {
      const group = await queryOne<{ id: string; engagement_share_enabled: boolean }>(
        `SELECT id, engagement_share_enabled FROM groups WHERE engagement_share_token = $1`,
        [publicToken]
      );
      if (!group || !group.engagement_share_enabled) {
        return NextResponse.json({ error: 'Link de engajamento inválido ou desativado' }, { status: 404 });
      }
      groupId = group.id;
    } else {
      const { getAdminSession } = await import('@/lib/auth/admin-session');
      const admin = await getAdminSession();
      if (admin && groupIdParam) groupId = groupIdParam;
      if (!groupId) {
        await requireAuth();
        const leader = await getCurrentLeader();
        groupId = leader?.group_id ?? null;
        if (leader?.role === 'coordinator' && groupIdParam) {
          const group = await queryOne<{ id: string; organization_id: string }>(
            `SELECT id, organization_id FROM groups WHERE id = $1`,
            [groupIdParam]
          );
          if (group && group.organization_id === leader.organization_id) {
            groupId = groupIdParam;
          } else {
            return NextResponse.json({ error: 'Grupo não encontrado ou não pertence à sua organização' }, { status: 403 });
          }
        }
      }
    }
    if (!groupId) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }

    // ── Encontros da janela (com qualquer registro) ──
    const today = new Date();
    const windowStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    windowStart.setUTCMonth(windowStart.getUTCMonth() - (windowMonths - 1));
    const windowStartIso = windowStart.toISOString().slice(0, 10);

    // ── Dados brutos (sem alias para `meetings`, pois a regra de visibilidade
    //    referencia `meetings.id` diretamente) ──
    const [members, attendanceRows, guestRows, visitorRows, tagRows, windowMeetings] = await Promise.all([
      queryMany<{ id: string; member_type: string; integration_stage: string; is_active: boolean; created_at: string; full_name: string }>(
        `SELECT id, member_type, integration_stage, is_active, created_at::text as created_at, full_name
         FROM members WHERE group_id = $1`,
        [groupId]
      ),
      queryMany<{ member_id: string; meeting_id: string; is_present: boolean; meeting_date: string }>(
        `SELECT a.member_id, a.meeting_id, a.is_present, meetings.meeting_date::text as meeting_date
         FROM attendance a
         JOIN meetings ON meetings.id = a.meeting_id
         WHERE meetings.group_id = $1 AND meetings.is_cancelled = FALSE
           AND ${MEETING_VISIBILITY}`,
        [groupId]
      ),
      queryMany<{ guest_id: string; meeting_id: string; meeting_date: string }>(
        `SELECT ag.guest_id, ag.meeting_id, meetings.meeting_date::text as meeting_date
         FROM attendance_guests ag
         JOIN meetings ON meetings.id = ag.meeting_id
         WHERE meetings.group_id = $1 AND meetings.is_cancelled = FALSE
           AND ${MEETING_VISIBILITY}`,
        [groupId]
      ),
      queryMany<{ created_at: string }>(
        `SELECT created_at::text as created_at FROM guest_visitors WHERE group_id = $1`,
        [groupId]
      ),
      queryMany<{ member_id: string; tag_key: string; tag_value: string }>(
        `SELECT mt.member_id, mt.tag_key, mt.tag_value
         FROM member_tags mt
         INNER JOIN members m ON m.id = mt.member_id
         WHERE m.group_id = $1`,
        [groupId]
      ),
      queryMany<{ id: string; meeting_date: string; title: string | null; meeting_type: string }>(
        `SELECT id, meeting_date::text as meeting_date, title, meeting_type
         FROM meetings
         WHERE group_id = $1 AND is_cancelled = FALSE
           AND meeting_date >= $2::date
           AND ${MEETING_VISIBILITY}
         ORDER BY meeting_date ASC`,
        [groupId, windowStartIso]
      ),
    ]);

    const result = computeGrowthMetrics({
      windowMonths,
      tags,
      members,
      attendanceRows,
      guestRows,
      visitorCount: visitorRows.length,
      guestCreatedAts: visitorRows.map((r) => r.created_at),
      tagRows,
      meetingsInWindow: windowMeetings,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro ao calcular crescimento:', error);
    return NextResponse.json({ error: 'Erro ao calcular métricas de crescimento' }, { status: 500 });
  }
}
