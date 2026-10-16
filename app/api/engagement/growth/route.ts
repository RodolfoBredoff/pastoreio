import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany, queryOne } from '@/lib/db/postgres';
import { parseTagFiltersJson, type TagFiltersPayload } from '@/lib/member-tags-filter';

/**
 * GET /api/engagement/growth
 *
 * Métricas de crescimento/progressão do grupo, com linguagem simples:
 *  - Totais: pessoas já registradas (membros + visitantes únicos), presentes
 *    pelo menos 1 vez, visitantes únicos, membros ativos e convertidos.
 *  - Novas pessoas por encontro (primeira aparição de cada pessoa).
 *  - Por mês: novas pessoas, visitantes que voltaram e visitantes que viraram membros.
 *  - Presença por encontro (membros x visitantes) para acompanhar progressão.
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

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, 15));
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const publicToken = searchParams.get('public_token')?.trim() || null;
    const groupIdParam = searchParams.get('group_id');
    const monthsRaw = Number(searchParams.get('months')) || 6;
    const windowMonths = [3, 6, 12].includes(monthsRaw) ? monthsRaw : 6;
    const tags: TagFiltersPayload | null = parseTagFiltersJson(searchParams.get('tags'));
    const tagFilterActive = !!tags && Object.keys(tags).length > 0;

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

    // ── Janela: início do mês N meses atrás (inclui o mês corrente) ──
    const today = new Date();
    const windowStart = addMonths(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), -(windowMonths - 1));
    const windowStartIso = windowStart.toISOString().slice(0, 10);
    const prevWindowEndIso = new Date(windowStart.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const prevWindowStart = addMonths(windowStart, -windowMonths);

    // ── Dados brutos ──
    const [members, attendanceRows, guestRows, visitorCount, tagRows] = await Promise.all([
      queryMany<{
        id: string; member_type: string; integration_stage: string; is_active: boolean;
        created_at: string; full_name: string;
      }>(
        `SELECT id, member_type, integration_stage, is_active, created_at::text as created_at, full_name
         FROM members WHERE group_id = $1`,
        [groupId]
      ),
      queryMany<{ member_id: string; meeting_id: string; is_present: boolean; meeting_date: string }>(
        `SELECT a.member_id, a.meeting_id, a.is_present, m.meeting_date::text as meeting_date
         FROM attendance a
         JOIN meetings m ON m.id = a.meeting_id
         WHERE m.group_id = $1 AND m.is_cancelled = FALSE AND ${MEETING_VISIBILITY}`,
        [groupId]
      ),
      queryMany<{ guest_id: string; meeting_id: string; meeting_date: string }>(
        `SELECT ag.guest_id, ag.meeting_id, m.meeting_date::text as meeting_date
         FROM attendance_guests ag
         JOIN meetings m ON m.id = ag.meeting_id
         WHERE m.group_id = $1 AND m.is_cancelled = FALSE AND ${MEETING_VISIBILITY}`,
        [groupId]
      ),
      queryOne<{ c: string }>(`SELECT COUNT(*)::text as c FROM guest_visitors WHERE group_id = $1`, [groupId]),
      queryMany<{ member_id: string; tag_key: string; tag_value: string }>(
        `SELECT mt.member_id, mt.tag_key, mt.tag_value
         FROM member_tags mt
         INNER JOIN members m ON m.id = mt.member_id
         WHERE m.group_id = $1`,
        [groupId]
      ),
    ]);

    // ── Filtro por tags (OR: membro tem qualquer valor escolhido) ──
    let tagFilteredIds: Set<string> | null = null;
    if (tagFilterActive && tags) {
      tagFilteredIds = new Set<string>();
      const byMember = new Map<string, Map<string, Set<string>>>();
      for (const row of tagRows) {
        let byKey = byMember.get(row.member_id);
        if (!byKey) { byKey = new Map(); byMember.set(row.member_id, byKey); }
        let vals = byKey.get(row.tag_key);
        if (!vals) { vals = new Set(); byKey.set(row.tag_key, vals); }
        vals.add(row.tag_value);
      }
      for (const [memberId, byKey] of byMember) {
        let passes = false;
        for (const [key, wanted] of Object.entries(tags)) {
          const memberVals = byKey.get(key);
          if (memberVals && wanted.some((w) => memberVals.has(w))) { passes = true; break; }
        }
        if (passes) tagFilteredIds.add(memberId);
      }
    }
    const memberAllowed = (id: string) => !tagFilteredIds || tagFilteredIds.has(id);

    // ── Primeira presença de cada pessoa (histórico completo) ──
    const memberFirstPresent = new Map<string, string>();
    for (const row of attendanceRows) {
      if (!row.is_present) continue;
      const cur = memberFirstPresent.get(row.member_id);
      if (!cur || row.meeting_date < cur) memberFirstPresent.set(row.member_id, row.meeting_date);
    }
    const guestFirstPresent = new Map<string, string>();
    for (const row of guestRows) {
      const cur = guestFirstPresent.get(row.guest_id);
      if (!cur || row.meeting_date < cur) guestFirstPresent.set(row.guest_id, row.meeting_date);
    }

    // ── Encontros da janela (com qualquer registro) ──
    const windowMeetings = await queryMany<{ id: string; meeting_date: string; title: string | null; meeting_type: string }>(
      `SELECT id, meeting_date::text as meeting_date, title, meeting_type
       FROM meetings
       WHERE group_id = $1 AND is_cancelled = FALSE
         AND meeting_date >= $2::date
         AND ${MEETING_VISIBILITY}
       ORDER BY meeting_date ASC`,
      [groupId, windowStartIso]
    );
    const meetingById = new Map(windowMeetings.map((m) => [m.id, m]));

    // ── Série por encontro: presença e novas pessoas ──
    const attendanceByMeeting = new Map<string, { member_id: string; is_present: boolean }[]>();
    for (const row of attendanceRows) {
      if (!meetingById.has(row.meeting_id)) continue;
      let arr = attendanceByMeeting.get(row.meeting_id);
      if (!arr) { arr = []; attendanceByMeeting.set(row.meeting_id, arr); }
      arr.push({ member_id: row.member_id, is_present: row.is_present });
    }
    const guestsByMeeting = new Map<string, string[]>();
    for (const row of guestRows) {
      if (!meetingById.has(row.meeting_id)) continue;
      let arr = guestsByMeeting.get(row.meeting_id);
      if (!arr) { arr = []; guestsByMeeting.set(row.meeting_id, arr); }
      arr.push(row.guest_id);
    }

    const perMeeting = windowMeetings.map((m) => {
      const att = attendanceByMeeting.get(m.id) ?? [];
      const guests = guestsByMeeting.get(m.id) ?? [];
      const membersPresent = att.filter((a) => a.is_present && memberAllowed(a.member_id)).length;
      const newMembers = att.filter(
        (a) => a.is_present && memberAllowed(a.member_id) && memberFirstPresent.get(a.member_id) === m.meeting_date
      ).length;
      const newGuests = guests.filter((g) => guestFirstPresent.get(g) === m.meeting_date).length;
      return {
        meeting_id: m.id,
        date: m.meeting_date,
        label: shortDate(m.meeting_date),
        title: m.title,
        newPeople: newMembers + newGuests,
        newMembers,
        newGuests,
        membersPresent,
        guestsPresent: guests.length,
        totalPresent: membersPresent + guests.length,
      };
    });

    // ── Séries mensais ──
    const monthKeys: string[] = [];
    for (let i = 0; i < windowMonths; i++) {
      monthKeys.push(monthKey(addMonths(windowStart, i).toISOString().slice(0, 10)));
    }

    const newMembersByMonth = new Map<string, number>();
    for (const [memberId, firstDate] of memberFirstPresent) {
      if (!memberAllowed(memberId)) continue;
      const k = monthKey(firstDate);
      newMembersByMonth.set(k, (newMembersByMonth.get(k) ?? 0) + 1);
    }
    const newGuestsByMonth = new Map<string, number>();
    for (const firstDate of guestFirstPresent.values()) {
      const k = monthKey(firstDate);
      newGuestsByMonth.set(k, (newGuestsByMonth.get(k) ?? 0) + 1);
    }

    // Visitantes que voltaram: presença em M com presença anterior
    const returnedByMonth = new Map<string, Set<string>>();
    for (const row of guestRows) {
      const first = guestFirstPresent.get(row.guest_id);
      if (!first || row.meeting_date <= first) continue;
      let set = returnedByMonth.get(monthKey(row.meeting_date));
      if (!set) { set = new Set(); returnedByMonth.set(monthKey(row.meeting_date), set); }
      set.add(row.guest_id);
    }

    // Visitantes que viraram membros (member criado na conversão)
    const conversionsByMonth = new Map<string, number>();
    let convertedTotal = 0;
    for (const m of members) {
      if (m.integration_stage !== 'membro') continue;
      convertedTotal++;
      const k = monthKey(m.created_at.slice(0, 10));
      conversionsByMonth.set(k, (conversionsByMonth.get(k) ?? 0) + 1);
    }

    const months = monthKeys.map((k) => ({
      month: k,
      label: monthLabel(k),
      newPeople: (newMembersByMonth.get(k) ?? 0) + (newGuestsByMonth.get(k) ?? 0),
      newMembers: newMembersByMonth.get(k) ?? 0,
      newGuests: newGuestsByMonth.get(k) ?? 0,
      returnedVisitors: returnedByMonth.get(k)?.size ?? 0,
      conversions: conversionsByMonth.get(k) ?? 0,
    }));

    // ── Totais e comparação com a janela anterior ──
    const firstMemberDates = [...memberFirstPresent.entries()]
      .filter(([id]) => memberAllowed(id))
      .map(([, d]) => d);
    const firstGuestDates = [...guestFirstPresent.values()];

    const newInWindow = firstMemberDates.filter((d) => d >= windowStartIso).length + firstGuestDates.filter((d) => d >= windowStartIso).length;
    const newInPrevWindow =
      firstMemberDates.filter((d) => d >= prevWindowStart.toISOString().slice(0, 10) && d <= prevWindowEndIso).length +
      firstGuestDates.filter((d) => d >= prevWindowStart.toISOString().slice(0, 10) && d <= prevWindowEndIso).length;

    let returnedInWindow = 0;
    for (const [k, set] of returnedByMonth) {
      if (monthKeys.includes(k)) returnedInWindow += set.size;
    }
    let conversionsInWindow = 0;
    for (const k of monthKeys) conversionsInWindow += conversionsByMonth.get(k) ?? 0;

    const membersAll = members.length;
    const membersActive = members.filter(
      (m: { is_active: boolean; member_type: string }) => m.is_active && m.member_type === 'participant'
    ).length;
    const attendedMemberIds = new Set([...memberFirstPresent.keys()].filter((id) => memberAllowed(id)));
    const attendedEver = attendedMemberIds.size + guestFirstPresent.size;

    // Tags disponíveis para o filtro
    const tagOptionsMap = new Map<string, Set<string>>();
    for (const row of tagRows) {
      let set = tagOptionsMap.get(row.tag_key);
      if (!set) { set = new Set(); tagOptionsMap.set(row.tag_key, set); }
      set.add(row.tag_value);
    }
    const availableTags = [...tagOptionsMap.entries()]
      .map(([key, values]) => ({ key, values: [...values].sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return NextResponse.json({
      windowMonths,
      totals: {
        peopleEver: membersAll + (parseInt(visitorCount?.c ?? '0', 10) || 0),
        uniqueVisitorsEver: parseInt(visitorCount?.c ?? '0', 10) || 0,
        membersAll,
        membersActive,
        convertedTotal,
        attendedEver,
        newInWindow,
        newInPrevWindow,
        returnedInWindow,
        conversionsInWindow,
      },
      perMeeting,
      months,
      availableTags,
      tagFilterActive,
    });
  } catch (error) {
    console.error('Erro ao calcular crescimento:', error);
    return NextResponse.json({ error: 'Erro ao calcular métricas de crescimento' }, { status: 500 });
  }
}
