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
 *  - months=3|6|12 (padrão 6): janela das séries temporais (usada quando não há
 *    from_month/to_month explícitos).
 *  - from_month=YYYY-MM & to_month=YYYY-MM (opcionais): janela explícita — usada
 *    quando a página de engajamento filtra por mês/trimestre/semestre específico.
 *    Ignora o parâmetro months quando presentes.
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

    // Janela explícita (filtro da página): from_month/to_month em YYYY-MM
    const ymPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
    const fromMonthRaw = searchParams.get('from_month')?.trim() || '';
    const toMonthRaw = searchParams.get('to_month')?.trim() || '';
    let windowFromIso: string | null = null;
    let windowToIso: string | null = null;
    if (ymPattern.test(fromMonthRaw) && ymPattern.test(toMonthRaw) && fromMonthRaw <= toMonthRaw) {
      const [fy, fm] = fromMonthRaw.split('-').map(Number);
      const [ty, tm] = toMonthRaw.split('-').map(Number);
      // Clamp de segurança: máximo de 36 meses por requisição
      const spanMonths = (ty - fy) * 12 + (tm - fm) + 1;
      const effFrom = spanMonths > 36
        ? `${ty + Math.floor((tm - 1 - 35) / 12)}-${String((((tm - 1 - 35) % 12) + 12) % 12 + 1).padStart(2, '0')}`
        : fromMonthRaw;
      windowFromIso = `${effFrom}-01`;
      windowToIso = new Date(Date.UTC(ty, tm, 0)).toISOString().slice(0, 10);
    }

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
    // Limite superior: explicitamente o fim do mês "to", ou o fim do mês corrente
    const windowEndIso = windowToIso
      ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

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
      queryMany<{ id: string; created_at: string; full_name: string }>(
        `SELECT id, created_at::text as created_at, full_name FROM guest_visitors WHERE group_id = $1`,
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
           AND meeting_date <= $3::date
           AND ${MEETING_VISIBILITY}
         ORDER BY meeting_date ASC`,
        [groupId, windowStartIso, windowEndIso]
      ),
    ]);

    const result = computeGrowthMetrics({
      windowMonths,
      windowFromIso: windowFromIso ?? undefined,
      windowToIso: windowToIso ?? undefined,
      tags,
      members,
      attendanceRows,
      guestRows,
      visitorCount: visitorRows.length,
      guestCreatedAts: visitorRows.map((r) => r.created_at),
      guestNames: visitorRows.map((r) => ({ id: r.id, full_name: r.full_name, created_at: r.created_at })),
      tagRows,
      meetingsInWindow: windowMeetings,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro ao calcular crescimento:', error);
    return NextResponse.json({ error: 'Erro ao calcular métricas de crescimento' }, { status: 500 });
  }
}
