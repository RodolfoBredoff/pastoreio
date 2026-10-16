/**
 * Funil de visitantes — funções puras (sem banco).
 * A rota /api/engagement/visitor-funnel busca os dados e chama computeVisitorFunnel.
 *
 * Regras (alinhadas com a seção Crescimento do grupo):
 *  - Presença real é a fonte da verdade (contagem de presenças por pessoa).
 *  - Visitantes não cadastrados (guest_visitors) entram no funil como visitantes.
 *  - Regra reduzida de conversão: vira "Convertido" quem tem integration_stage
 *    'membro' OU participante com 4+ presenças. Visitantes não cadastrados
 *    nunca aparecem como convertidos (no máximo 4+ visitas).
 */

export interface FunnelMemberRow {
  id: string;
  full_name: string;
  member_type: string;
  integration_stage: string;
  created_at: string; // ISO/texto; usa-se a parte da data
}

export interface FunnelMemberAttendanceRow {
  member_id: string;
  meeting_id: string;
  is_present: boolean;
  meeting_date: string;
}

export interface FunnelGuestRow {
  id: string;
  full_name: string;
  created_at: string;
}

export interface FunnelGuestAttendanceRow {
  guest_id: string;
  meeting_id: string;
  meeting_date: string;
}

export interface FunnelInput {
  periodDays: number;
  today: Date;
  members: FunnelMemberRow[];
  memberAttendance: FunnelMemberAttendanceRow[];
  guests: FunnelGuestRow[];
  guestAttendance: FunnelGuestAttendanceRow[];
}

export interface FunnelPerson {
  id: string;
  name: string;
  kind: 'member' | 'guest';
  visits: number;
}

export type FunnelStageKey = 'visit_1' | 'visit_2' | 'visit_3' | 'visit_4' | 'converted';

export interface FunnelStage {
  stage: FunnelStageKey;
  label: string;
  count: number;
  percentage: number; // % do stage anterior
  dropoff: number; // % que não passou para o próximo stage
  memberIds: string[];
  people: FunnelPerson[];
  benchmark: number;
}

export interface FunnelResult {
  stages: FunnelStage[];
  total_visitors: number;
  conversion_rate: number;
  avg_visits_to_conversion: number;
  period_days: number;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeVisitorFunnel(input: FunnelInput): FunnelResult {
  const { periodDays, today, members, memberAttendance, guests, guestAttendance } = input;

  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - periodDays);
  const startIso = toIsoDate(startDate);

  // Presenças por pessoa (histórico completo; pessoa precisa ter sido criada na janela)
  const memberVisits = new Map<string, Set<string>>();
  for (const row of memberAttendance) {
    if (!row.is_present) continue;
    let set = memberVisits.get(row.member_id);
    if (!set) { set = new Set(); memberVisits.set(row.member_id, set); }
    set.add(row.meeting_id);
  }
  const guestVisits = new Map<string, Set<string>>();
  for (const row of guestAttendance) {
    let set = guestVisits.get(row.guest_id);
    if (!set) { set = new Set(); guestVisits.set(row.guest_id, set); }
    set.add(row.meeting_id);
  }

  interface Candidate extends FunnelPerson {
    memberType: string;
    integrationStage: string;
  }

  const candidates: Candidate[] = [];
  for (const m of members) {
    if (m.created_at.slice(0, 10) < startIso) continue;
    const visits = memberVisits.get(m.id)?.size ?? 0;
    if (visits === 0) continue;
    candidates.push({
      id: m.id,
      name: m.full_name,
      kind: 'member',
      visits,
      memberType: m.member_type,
      integrationStage: m.integration_stage,
    });
  }
  for (const g of guests) {
    if (g.created_at.slice(0, 10) < startIso) continue;
    const visits = guestVisits.get(g.id)?.size ?? 0;
    if (visits === 0) continue;
    candidates.push({ id: g.id, name: g.full_name, kind: 'guest', visits, memberType: 'guest', integrationStage: '' });
  }

  // Classificação (regra reduzida de conversão)
  const byStage = new Map<FunnelStageKey, Candidate[]>();
  const pushStage = (stage: FunnelStageKey, c: Candidate) => {
    let arr = byStage.get(stage);
    if (!arr) { arr = []; byStage.set(stage, arr); }
    arr.push(c);
  };

  const converted: Candidate[] = [];
  for (const c of candidates) {
    const isConverted =
      c.kind === 'member' &&
      (c.integrationStage === 'membro' || (c.memberType === 'participant' && c.visits >= 4));
    if (isConverted) {
      converted.push(c);
      continue;
    }
    if (c.visits >= 4) pushStage('visit_4', c);
    else if (c.visits === 3) pushStage('visit_3', c);
    else if (c.visits === 2) pushStage('visit_2', c);
    else pushStage('visit_1', c);
  }

  const visit1People = candidates;
  const visit2People = candidates.filter((c) => c.visits >= 2);
  const visit3People = candidates.filter((c) => c.visits >= 3);
  const visit4People = candidates.filter((c) => c.visits >= 4);

  const visit1Count = visit1People.length;
  const visit2Count = visit2People.length;
  const visit3Count = visit3People.length;
  const visit4Count = visit4People.length;
  const convertedCount = converted.length;

  const toFunnelPerson = (c: Candidate): FunnelPerson => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    visits: c.visits,
  });

  const stageDef: Array<{
    stage: FunnelStageKey;
    label: string;
    count: number;
    nextCount: number | null;
    people: Candidate[];
    benchmark: number;
  }> = [
    { stage: 'visit_1', label: '1ª Visita', count: visit1Count, nextCount: visit2Count, people: visit1People, benchmark: 100 },
    { stage: 'visit_2', label: '2ª Visita', count: visit2Count, nextCount: visit3Count, people: visit2People, benchmark: 40 },
    { stage: 'visit_3', label: '3ª Visita', count: visit3Count, nextCount: visit4Count, people: visit3People, benchmark: 60 },
    { stage: 'visit_4', label: '4ª Visita', count: visit4Count, nextCount: convertedCount, people: visit4People, benchmark: 70 },
    { stage: 'converted', label: 'Convertidos', count: convertedCount, nextCount: null, people: converted, benchmark: 20 },
  ];

  const stages: FunnelStage[] = stageDef.map((s, i) => {
    const prevCount = i === 0 ? null : stageDef[i - 1].count;
    return {
      stage: s.stage,
      label: s.label,
      count: s.count,
      percentage: prevCount && prevCount > 0 ? Math.round((100 * s.count) / prevCount) : i === 0 ? 100 : 0,
      dropoff:
        s.nextCount !== null && s.count > 0
          ? Math.round((100 * (s.count - s.nextCount)) / s.count)
          : 0,
      memberIds: s.people.filter((p) => p.kind === 'member').map((p) => p.id),
      people: s.people.map(toFunnelPerson),
      benchmark: s.benchmark,
    };
  });

  const avgVisits =
    converted.length > 0
      ? Math.round((converted.reduce((s, c) => s + c.visits, 0) / converted.length) * 10) / 10
      : 0;

  return {
    stages,
    total_visitors: visit1Count,
    conversion_rate: visit1Count > 0 ? Math.round((100 * convertedCount) / visit1Count) : 0,
    avg_visits_to_conversion: avgVisits,
    period_days: periodDays,
  };
}
