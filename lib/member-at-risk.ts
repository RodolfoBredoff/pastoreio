/**
 * Membros em risco — funções puras (sem banco).
 * A rota /api/members/at-risk busca os dados e chama computeAtRiskMembers.
 *
 * Regras FLEXIBILIZADAS (pedido do usuário: quem "aparece às vezes" não deve
 * ser tratado como risco):
 *  - 2 ausências consecutivas NÃO pontuam (ritmo normal de quem falta de vez
 *    em quando); só 3+ ausências seguidas entram na conta.
 *  - Frequência só penaliza abaixo de 40% (antes: 60%); abaixo de 25% é crítica.
 *  - 30 dias sem presença NÃO é mais fator; só 60+ dias — ou nenhuma presença
 *    em todo o período (para quem já existia no grupo antes da janela).
 * Níveis: ≥75 crítico, ≥55 alto, ≥30 médio; abaixo disso não entra na lista.
 */

export interface AtRiskMemberRow {
  id: string;
  full_name: string;
  member_type: 'participant' | 'visitor';
  phone: string | null;
  consecutive_absences: number;
}

export interface AtRiskFrequencyRow {
  id: string;
  total_meetings: number;
  attended: number;
  frequency_rate: number | null;
  last_attendance_date: string | null;
  days_since_last: number | null;
  created_at: string;
}

export interface MemberAtRisk {
  id: string;
  full_name: string;
  member_type: 'participant' | 'visitor';
  phone: string | null;
  consecutive_absences: number;
  frequency_rate: number | null;
  total_meetings: number;
  attended: number;
  last_attendance_date: string | null;
  days_since_last: number | null;
  risk_level: 'medium' | 'high' | 'critical';
  risk_factors: string[];
}

export interface AtRiskInput {
  consecutiveRows: AtRiskMemberRow[];
  frequencyRows: AtRiskFrequencyRow[];
  riskLevelFilter: 'all' | 'medium' | 'high' | 'critical';
  /** Início da janela (YYYY-MM-DD): quem foi criado depois dela não leva o
   *  fator "sem presença no período" (membro novo ainda não passou por chamada). */
  windowStartIso: string;
}

export interface AtRiskResult {
  members: MemberAtRisk[];
  summary: { total: number; critical: number; high: number; medium: number };
}

function scoreMember(
  member: AtRiskMemberRow,
  freq: AtRiskFrequencyRow,
  windowStartIso: string
): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  // Fator 1: ausências consecutivas (últimos 5 encontros) — só 3+
  if (member.consecutive_absences >= 4) {
    factors.push(`${member.consecutive_absences} ausências consecutivas`);
    score += 40;
  } else if (member.consecutive_absences === 3) {
    factors.push(`${member.consecutive_absences} ausências consecutivas`);
    score += 25;
  }

  // Fator 2: frequência no período — só abaixo de 40%
  const rate = freq.frequency_rate ?? 0;
  if (rate < 25) {
    factors.push(`Frequência ${rate}% (crítica)`);
    score += 40;
  } else if (rate < 40) {
    factors.push(`Frequência ${rate}% (baixa)`);
    score += 15;
  }

  // Fator 3: tempo desde a última presença — só 60+ dias, ou nenhuma no período
  if (freq.last_attendance_date === null) {
    if (freq.created_at.slice(0, 10) <= windowStartIso) {
      factors.push('Sem presença em todo o período');
      score += 25;
    }
  } else if (freq.days_since_last !== null && freq.days_since_last > 60) {
    factors.push(`${freq.days_since_last} dias sem presença`);
    score += 30;
  }

  return { score, factors };
}

function riskLevelOf(score: number): 'medium' | 'high' | 'critical' | null {
  if (score >= 75) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  return null;
}

export function computeAtRiskMembers(input: AtRiskInput): AtRiskResult {
  const { consecutiveRows, frequencyRows, riskLevelFilter, windowStartIso } = input;

  const frequencyMap = new Map(frequencyRows.map((f) => [f.id, f]));

  const atRiskMembers: MemberAtRisk[] = [];

  for (const member of consecutiveRows) {
    const freq = frequencyMap.get(member.id);
    if (!freq) continue;

    const { score, factors } = scoreMember(member, freq, windowStartIso);
    const level = riskLevelOf(score);
    if (!level) continue;

    if (riskLevelFilter !== 'all' && level !== riskLevelFilter) continue;

    atRiskMembers.push({
      id: member.id,
      full_name: member.full_name,
      member_type: member.member_type,
      phone: member.phone,
      consecutive_absences: member.consecutive_absences,
      frequency_rate: freq.frequency_rate,
      total_meetings: freq.total_meetings,
      attended: freq.attended,
      last_attendance_date: freq.last_attendance_date,
      days_since_last: freq.days_since_last,
      risk_level: level,
      risk_factors: factors,
    });
  }

  const riskLevelOrder = { critical: 3, high: 2, medium: 1 } as const;
  atRiskMembers.sort((a, b) => {
    const levelDiff = riskLevelOrder[b.risk_level] - riskLevelOrder[a.risk_level];
    if (levelDiff !== 0) return levelDiff;
    return b.consecutive_absences - a.consecutive_absences;
  });

  return {
    members: atRiskMembers,
    summary: {
      total: atRiskMembers.length,
      critical: atRiskMembers.filter((m) => m.risk_level === 'critical').length,
      high: atRiskMembers.filter((m) => m.risk_level === 'high').length,
      medium: atRiskMembers.filter((m) => m.risk_level === 'medium').length,
    },
  };
}
