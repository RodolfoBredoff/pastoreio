import type { TagFiltersPayload } from '@/lib/member-tags-filter';

/**
 * Cálculos de crescimento/progressão do grupo — funções puras (sem banco).
 * A rota /api/engagement/growth busca os dados e chama computeGrowthMetrics.
 *
 * Linguagem simples nos rótulos: os números alimentam gráficos para pessoas
 * não técnicas (crescimento, retorno, frequência).
 *
 * Regras de progressão (por presença real, não por estágio — estágios podem ficar
 * defasados porque a conversão automática transforma guest em member na 2ª presença):
 *  - "Voltou" = 2ª presença da pessoa (guest avulso OU membro tipo visitante),
 *    contada no mês em que ocorreu.
 *  - "Virou membro" = 5ª presença da pessoa (regra do grupo), contada no mês em que
 *    completou — vale retroativamente para quem já completou.
 */

export interface GrowthMemberRow {
  id: string;
  member_type: string;
  integration_stage: string;
  is_active: boolean;
  created_at: string; // 'YYYY-MM-DD...' (texto)
  full_name: string;
}

export interface GrowthAttendanceRow {
  member_id: string;
  meeting_id: string;
  is_present: boolean;
  meeting_date: string; // 'YYYY-MM-DD'
}

export interface GrowthGuestRow {
  guest_id: string;
  meeting_id: string;
  meeting_date: string; // 'YYYY-MM-DD'
}

export interface GrowthTagRow {
  member_id: string;
  tag_key: string;
  tag_value: string;
}

export interface GrowthMeetingRow {
  id: string;
  meeting_date: string;
  title: string | null;
  meeting_type: string;
}

export interface GrowthPerMeetingPoint {
  meeting_id: string;
  date: string;
  label: string;
  title: string | null;
  newPeople: number;
  newMembers: number;
  newGuests: number;
  membersPresent: number;
  guestsPresent: number;
  totalPresent: number;
}

export interface GrowthMonthPoint {
  month: string;
  label: string;
  newPeople: number;
  newMembers: number;
  newGuests: number;
  returnedVisitors: number;
  conversions: number;
}

export interface GrowthTotals {
  peopleEver: number;
  uniqueVisitorsEver: number;
  membersAll: number;
  membersActive: number;
  convertedTotal: number;
  attendedEver: number;
  newInWindow: number;
  newInPrevWindow: number;
  returnedInWindow: number;
  conversionsInWindow: number;
}

export interface GrowthTrend {
  recentAvg: number | null;
  prevAvg: number | null;
  delta: number | null;
  recentCount: number;
  prevCount: number;
}

export interface GrowthFrequencyBuckets {
  totalMeetings: number;
  consideredMembers: number;
  buckets: { key: string; label: string; count: number }[];
}

export interface GrowthNewVisitorReturn {
  newVisitors: number;
  returned: number;
  rate: number | null;
}

export interface GrowthResult {
  windowMonths: number;
  totals: GrowthTotals;
  perMeeting: GrowthPerMeetingPoint[];
  months: GrowthMonthPoint[];
  growthTrend: GrowthTrend;
  memberFrequency: GrowthFrequencyBuckets | null;
  newVisitorReturn: GrowthNewVisitorReturn;
  cumulativeByMonth: { month: string; label: string; total: number }[];
  availableTags: { key: string; values: string[] }[];
  tagFilterActive: boolean;
  lists: {
    peopleEver: { name: string; kind: string; active: boolean }[];
    visitors: { name: string; presences: number; firstDate: string }[];
    membersActive: string[];
    pathToMember: { name: string; kind: string; presences: number }[];
    newInWindow: { name: string; kind: string; date: string; label: string }[];
    /** Pessoas cuja 2ª presença caiu na janela (gráfico mensal clicável). */
    returned: { name: string; kind: string; date: string; label: string }[];
    /** Pessoas cuja 5ª presença caiu na janela (gráfico mensal clicável). */
    converted: { name: string; kind: string; date: string; label: string }[];
  };
}

export interface GrowthComputeInput {
  windowMonths: number;
  /** Janela explícita (opcional): 1º dia do 1º mês e último dia do último mês (YYYY-MM-DD).
   *  Usada quando a página filtra por mês/trimestre/semestre específico. */
  windowFromIso?: string;
  windowToIso?: string;
  tags: TagFiltersPayload | null;
  members: GrowthMemberRow[];
  attendanceRows: GrowthAttendanceRow[];
  guestRows: GrowthGuestRow[];
  visitorCount: number;
  guestCreatedAts: string[];
  guestNames: { id: string; full_name: string; created_at: string }[];
  tagRows: GrowthTagRow[];
  meetingsInWindow: GrowthMeetingRow[];
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function growthMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, 15));
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function growthShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

function lastDayOfMonthIso(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function monthsBetweenInclusive(fromIso: string, toIso: string): number {
  const fy = Number(fromIso.slice(0, 4));
  const fm = Number(fromIso.slice(5, 7));
  const ty = Number(toIso.slice(0, 4));
  const tm = Number(toIso.slice(5, 7));
  return (ty - fy) * 12 + (tm - fm) + 1;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

export function computeGrowthMetrics(input: GrowthComputeInput): GrowthResult {
  const { windowMonths, tags, members, attendanceRows, guestRows, visitorCount, guestCreatedAts, tagRows, meetingsInWindow } = input;
  const tagFilterActive = !!tags && Object.keys(tags).length > 0;

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

  // ── Janela de tempo: explícita (from/to, quando a página filtra mês/trimestre/semestre)
  //    ou relativa a hoje (windowMonths) ──
  const today = new Date();
  const explicitWindow = !!(input.windowFromIso && input.windowToIso);
  const windowStartIso = explicitWindow
    ? input.windowFromIso!
    : addMonths(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), -(windowMonths - 1)).toISOString().slice(0, 10);
  const windowEndIso = explicitWindow
    ? input.windowToIso!
    : lastDayOfMonthIso(monthKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10)));
  const windowSpanMonths = Math.max(1, monthsBetweenInclusive(windowStartIso, windowEndIso));
  const windowStartDate = new Date(`${windowStartIso}T00:00:00Z`);
  const prevWindowStartIso = addMonths(windowStartDate, -windowSpanMonths).toISOString().slice(0, 10);
  const prevWindowEndIso = new Date(windowStartDate.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);

  // ── Série por encontro: presença e novas pessoas (apenas encontros da janela) ──
  const inWindowMeetings = meetingsInWindow.filter((m) => m.meeting_date >= windowStartIso && m.meeting_date <= windowEndIso);
  const attendanceByMeeting = new Map<string, { member_id: string; is_present: boolean }[]>();
  for (const row of attendanceRows) {
    if (!inWindowMeetings.some((m) => m.id === row.meeting_id)) continue;
    let arr = attendanceByMeeting.get(row.meeting_id);
    if (!arr) { arr = []; attendanceByMeeting.set(row.meeting_id, arr); }
    arr.push({ member_id: row.member_id, is_present: row.is_present });
  }
  const guestsByMeeting = new Map<string, string[]>();
  for (const row of guestRows) {
    if (!inWindowMeetings.some((m) => m.id === row.meeting_id)) continue;
    let arr = guestsByMeeting.get(row.meeting_id);
    if (!arr) { arr = []; guestsByMeeting.set(row.meeting_id, arr); }
    arr.push(row.guest_id);
  }

  const perMeeting: GrowthPerMeetingPoint[] = inWindowMeetings.map((m) => {
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
      label: growthShortDate(m.meeting_date),
      title: m.title,
      newPeople: newMembers + newGuests,
      newMembers,
      newGuests,
      membersPresent,
      guestsPresent: guests.length,
      totalPresent: membersPresent + guests.length,
    };
  });


  const monthKeys: string[] = [];
  {
    let cur = monthKey(windowStartIso);
    const endKey = monthKey(windowEndIso);
    while (cur <= endKey) {
      monthKeys.push(cur);
      cur = nextMonthKey(cur);
    }
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

  // ── Visitantes: presenças reais combinando as duas fontes ──
  // A conversão automática transforma o guest em member (tipo visitante) na 2ª
  // presença e apaga os registros de guest — quem volta costuma aparecer como
  // member, não como guest. Por isso retorno e conversão usam as duas fontes
  // somadas, sempre por presença real (não por estágio de integração).
  const guestAttendanceCount = new Map<string, number>();
  for (const row of guestRows) {
    guestAttendanceCount.set(row.guest_id, (guestAttendanceCount.get(row.guest_id) ?? 0) + 1);
  }
  const guestPresenceDates = new Map<string, string[]>();
  for (const row of guestRows) {
    let arr = guestPresenceDates.get(row.guest_id);
    if (!arr) { arr = []; guestPresenceDates.set(row.guest_id, arr); }
    arr.push(row.meeting_date);
  }
  const visitorMemberIds = new Set(
    members.filter((m) => m.member_type === 'visitor' && memberAllowed(m.id)).map((m) => m.id)
  );
  const visitorMemberPresenceDates = new Map<string, string[]>();
  for (const row of attendanceRows) {
    if (!row.is_present || !visitorMemberIds.has(row.member_id)) continue;
    let arr = visitorMemberPresenceDates.get(row.member_id);
    if (!arr) { arr = []; visitorMemberPresenceDates.set(row.member_id, arr); }
    arr.push(row.meeting_date);
  }

  // "Voltou": 2ª presença da pessoa — contada uma vez, no mês em que ocorreu
  const returnedByMonth = new Map<string, Set<string>>();
  const addReturnAt = (personKey: string, dates: string[]) => {
    const ds = [...new Set(dates)].sort();
    if (ds.length < 2) return;
    const k = monthKey(ds[1]);
    let set = returnedByMonth.get(k);
    if (!set) { set = new Set(); returnedByMonth.set(k, set); }
    set.add(personKey);
  };
  for (const [guestId, dates] of guestPresenceDates) addReturnAt(`g:${guestId}`, dates);
  for (const [memberId, dates] of visitorMemberPresenceDates) addReturnAt(`m:${memberId}`, dates);

  // "Virou membro": 5ª presença da pessoa (regra do grupo) — contada no mês em que
  // completou, valendo também para quem já completou antes (cálculo retroativo).
  // Membros participantes não entram: eles já eram membros.
  const conversionsByMonth = new Map<string, number>();
  let convertedTotal = 0;
  for (const m of members) {
    if (m.integration_stage === 'membro') convertedTotal++;
  }
  const addConversionAt = (dates: string[]) => {
    const ds = [...new Set(dates)].sort();
    if (ds.length < 5) return;
    const k = monthKey(ds[4]);
    conversionsByMonth.set(k, (conversionsByMonth.get(k) ?? 0) + 1);
  };
  for (const dates of guestPresenceDates.values()) addConversionAt(dates);
  for (const dates of visitorMemberPresenceDates.values()) addConversionAt(dates);

  const months: GrowthMonthPoint[] = monthKeys.map((k) => ({
    month: k,
    label: growthMonthLabel(k),
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

  const newInWindow =
    firstMemberDates.filter((d) => d >= windowStartIso && d <= windowEndIso).length +
    firstGuestDates.filter((d) => d >= windowStartIso && d <= windowEndIso).length;
  const newInPrevWindow =
    firstMemberDates.filter((d) => d >= prevWindowStartIso && d <= prevWindowEndIso).length +
    firstGuestDates.filter((d) => d >= prevWindowStartIso && d <= prevWindowEndIso).length;

  let returnedInWindow = 0;
  for (const [k, set] of returnedByMonth) {
    if (monthKeys.includes(k)) returnedInWindow += set.size;
  }
  let conversionsInWindow = 0;
  for (const k of monthKeys) conversionsInWindow += conversionsByMonth.get(k) ?? 0;

  const membersAll = members.length;
  const membersActive = members.filter((m) => m.is_active && m.member_type === 'participant').length;
  const attendedMemberIds = new Set([...memberFirstPresent.keys()].filter((id) => memberAllowed(id)));
  const attendedEver = attendedMemberIds.size + guestFirstPresent.size;

  // ── O grupo está crescendo? (média de presentes: últimos 3 encontros vs 3 anteriores) ──
  const withData = perMeeting.filter((p) => p.totalPresent > 0 || p.newPeople > 0);
  const totalsList = withData.length >= 6 ? withData.map((p) => p.totalPresent) : [];
  const recentAvg = totalsList.length >= 6 ? avg(totalsList.slice(-3)) : null;
  const prevAvg = totalsList.length >= 6 ? avg(totalsList.slice(-6, -3)) : null;
  const growthTrend: GrowthTrend = {
    recentAvg,
    prevAvg,
    delta: recentAvg !== null && prevAvg !== null ? Math.round((recentAvg - prevAvg) * 10) / 10 : null,
    recentCount: totalsList.length >= 6 ? 3 : 0,
    prevCount: totalsList.length >= 6 ? 3 : 0,
  };

  // ── Frequência dos membros no período (assinatura de participação) ──
  const windowMeetingIds = new Set(meetingsInWindow.map((m) => m.id));
  const totalMeetings = meetingsInWindow.length;
  let memberFrequency: GrowthFrequencyBuckets | null = null;
  if (totalMeetings > 0) {
    const presencesInWindow = new Map<string, number>();
    for (const row of attendanceRows) {
      if (!windowMeetingIds.has(row.meeting_id) || !row.is_present) continue;
      presencesInWindow.set(row.member_id, (presencesInWindow.get(row.member_id) ?? 0) + 1);
    }
    const bucketsMap: Record<string, number> = {
      assiduo: 0,
      regular: 0,
      irregular: 0,
      afastado: 0,
      ausente_total: 0,
    };
    let considered = 0;
    for (const m of members) {
      if (!m.is_active || m.member_type !== 'participant') continue;
      if (!memberAllowed(m.id)) continue;
      considered++;
      const p = presencesInWindow.get(m.id) ?? 0;
      const rate = p / totalMeetings;
      if (p === 0) bucketsMap.ausente_total++;
      else if (rate >= 0.75) bucketsMap.assiduo++;
      else if (rate >= 0.5) bucketsMap.regular++;
      else if (rate >= 0.25) bucketsMap.irregular++;
      else bucketsMap.afastado++;
    }
    memberFrequency = {
      totalMeetings,
      consideredMembers: considered,
      buckets: [
        { key: 'assiduo', label: 'Assíduos (75%+ dos encontros)', count: bucketsMap.assiduo },
        { key: 'regular', label: 'Regulares (50–74%)', count: bucketsMap.regular },
        { key: 'irregular', label: 'Irregulares (25–49%)', count: bucketsMap.irregular },
        { key: 'afastado', label: 'Afastados (menos de 25%)', count: bucketsMap.afastado },
        { key: 'ausente_total', label: 'Sem presença no período', count: bucketsMap.ausente_total },
      ],
    };
  }

  // ── Visitantes novos que voltaram (guests avulsos + membros tipo visitante) ──
  const newVisitorCandidates: string[][] = [
    ...[...guestPresenceDates.values()],
    ...[...visitorMemberPresenceDates.values()],
  ];
  const uniqueSorted = (dates: string[]) => [...new Set(dates)].sort();
  const isFirstInWindow = (dates: string[]) => {
    const first = uniqueSorted(dates)[0];
    return first >= windowStartIso && first <= windowEndIso;
  };
  const newVisitorsInWindow = newVisitorCandidates.filter(isFirstInWindow).length;
  const returnedOfNew = newVisitorCandidates.filter(
    (dates) => isFirstInWindow(dates) && uniqueSorted(dates).length >= 2
  ).length;
  const newVisitorReturn: GrowthNewVisitorReturn = {
    newVisitors: newVisitorsInWindow,
    returned: returnedOfNew,
    rate: newVisitorsInWindow > 0 ? Math.round((returnedOfNew / newVisitorsInWindow) * 100) : null,
  };

  // ── Total de pessoas ao longo do tempo (acumulado por mês) ──
  // Quando a janela é curta (1–2 meses, ex.: filtro de um mês específico), estende a
  // exibição 5 meses para trás para dar contexto — o valor é o acumulado desde o
  // início do grupo, então os pontos extras são válidos.
  const cumulativeKeys: string[] = [];
  {
    const endKey = monthKey(windowEndIso);
    const startKey = monthKeys.length <= 2
      ? monthKey(addMonths(windowStartDate, -5).toISOString().slice(0, 10))
      : monthKey(windowStartIso);
    let cur = startKey;
    while (cur <= endKey) {
      cumulativeKeys.push(cur);
      cur = nextMonthKey(cur);
    }
  }
  const cumulativeByMonth = cumulativeKeys.map((k) => {
    const end = lastDayOfMonthIso(k);
    const membersAt = members.filter((m) => m.created_at.slice(0, 10) <= end).length;
    const guestsAt = guestCreatedAts.filter((d) => d.slice(0, 10) <= end).length;
    return { month: k, label: growthMonthLabel(k), total: membersAt + guestsAt };
  });

  // ── Regra reduzida de "virar membro": conversões manuais + visitantes que voltaram ──
  const memberPresences = new Map<string, number>();
  for (const row of attendanceRows) {
    if (!row.is_present) continue;
    memberPresences.set(row.member_id, (memberPresences.get(row.member_id) ?? 0) + 1);
  }
  const memberById = new Map(members.map((m) => [m.id, m]));
  const pathSeen = new Set<string>();
  const pathToMember: { name: string; kind: string; presences: number }[] = [];
  for (const m of members) {
    if (m.integration_stage === 'membro') {
      if (memberAllowed(m.id)) {
        pathToMember.push({ name: m.full_name, kind: 'Membro', presences: memberPresences.get(m.id) ?? 0 });
      }
      pathSeen.add(m.id);
    }
  }
  for (const m of members) {
    if (pathSeen.has(m.id) || m.member_type !== 'visitor' || !m.is_active || !memberAllowed(m.id)) continue;
    const presences = memberPresences.get(m.id) ?? 0;
    if (presences < 2) continue;
    const kind = m.integration_stage === 'integrando' ? 'Em integração' : 'Voltou';
    pathToMember.push({ name: m.full_name, kind, presences });
    pathSeen.add(m.id);
  }
  pathToMember.sort((a, b) => b.presences - a.presences || a.name.localeCompare(b.name));

  // ── Listas para os cartões clicáveis ──
  const guestNameById = new Map(input.guestNames.map((g) => [g.id, g.full_name]));
  const peopleEver = [
    ...members
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({
        name: m.full_name,
        kind: m.member_type === 'participant' ? 'Membro' : 'Visitante',
        active: m.is_active,
      })),
    ...input.guestNames
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((g) => ({ name: g.full_name, kind: 'Visitante', active: true })),
  ];

  const visitors = [...guestFirstPresent.entries()]
    .map(([guestId, firstDate]) => ({
      name: guestNameById.get(guestId) ?? 'Visitante',
      presences: guestAttendanceCount.get(guestId) ?? 0,
      firstDate,
    }))
    .sort((a, b) => b.presences - a.presences || a.name.localeCompare(b.name));

  const membersActiveNames = members
    .filter((m) => m.is_active && m.member_type === 'participant' && memberAllowed(m.id))
    .map((m) => m.full_name)
    .sort((a, b) => a.localeCompare(b));

  const newInWindowList: { name: string; kind: string; date: string; label: string }[] = [];
  for (const [memberId, firstDate] of memberFirstPresent) {
    if (!memberAllowed(memberId) || firstDate < windowStartIso || firstDate > windowEndIso) continue;
    newInWindowList.push({
      name: memberById.get(memberId)?.full_name ?? 'Pessoa',
      kind: memberById.get(memberId)?.member_type === 'participant' ? 'Membro' : 'Visitante',
      date: firstDate,
      label: growthShortDate(firstDate),
    });
  }
  for (const [guestId, firstDate] of guestFirstPresent) {
    if (firstDate < windowStartIso || firstDate > windowEndIso) continue;
    newInWindowList.push({ name: guestNameById.get(guestId) ?? 'Visitante', kind: 'Visitante', date: firstDate, label: growthShortDate(firstDate) });
  }
  newInWindowList.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));

  // ── Listas por mês para os gráficos clicáveis ("Voltou" = 2ª presença,
  //    "Virou membro" = 5ª presença) — limitadas à janela, cobrindo todo clique ──
  const isInWindow = (d: string) => d >= windowStartIso && d <= windowEndIso;
  const presenceListEntry = (
    name: string, kind: string, ds: string[], nth: number
  ): { name: string; kind: string; date: string; label: string } => ({
    name,
    kind,
    date: ds[nth],
    label: growthShortDate(ds[nth]),
  });
  const returnedList: { name: string; kind: string; date: string; label: string }[] = [];
  for (const [guestId, dates] of guestPresenceDates) {
    const ds = uniqueSorted(dates);
    if (ds.length >= 2 && isInWindow(ds[1])) returnedList.push(presenceListEntry(guestNameById.get(guestId) ?? 'Visitante', 'Avulso', ds, 1));
  }
  for (const [memberId, dates] of visitorMemberPresenceDates) {
    const ds = uniqueSorted(dates);
    if (ds.length >= 2 && isInWindow(ds[1])) {
      returnedList.push(presenceListEntry(memberById.get(memberId)?.full_name ?? 'Visitante', 'Cadastrado', ds, 1));
    }
  }
  const convertedList: { name: string; kind: string; date: string; label: string }[] = [];
  for (const [guestId, dates] of guestPresenceDates) {
    const ds = uniqueSorted(dates);
    if (ds.length >= 5 && isInWindow(ds[4])) convertedList.push(presenceListEntry(guestNameById.get(guestId) ?? 'Visitante', 'Avulso', ds, 4));
  }
  for (const [memberId, dates] of visitorMemberPresenceDates) {
    const ds = uniqueSorted(dates);
    if (ds.length >= 5 && isInWindow(ds[4])) {
      convertedList.push(presenceListEntry(memberById.get(memberId)?.full_name ?? 'Visitante', 'Cadastrado', ds, 4));
    }
  }
  returnedList.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  convertedList.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));

  // ── Tags disponíveis para o filtro ──
  const tagOptionsMap = new Map<string, Set<string>>();
  for (const row of tagRows) {
    let set = tagOptionsMap.get(row.tag_key);
    if (!set) { set = new Set(); tagOptionsMap.set(row.tag_key, set); }
    set.add(row.tag_value);
  }
  const availableTags = [...tagOptionsMap.entries()]
    .map(([key, values]) => ({ key, values: [...values].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    windowMonths: explicitWindow ? windowSpanMonths : windowMonths,
    totals: {
      peopleEver: membersAll + visitorCount,
      uniqueVisitorsEver: visitorCount,
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
    growthTrend,
    memberFrequency,
    newVisitorReturn,
    cumulativeByMonth,
    availableTags,
    tagFilterActive,
    lists: {
      peopleEver,
      visitors,
      membersActive: membersActiveNames,
      pathToMember,
      newInWindow: newInWindowList,
      returned: returnedList,
      converted: convertedList,
    },
  };
}
