/**
 * Teste local de computeAtRiskMembers com dados sintéticos.
 * Uso: npx tsx scripts/test-member-at-risk.ts
 *
 * Janela de 90 dias: início fixo 2026-07-17 (hoje = 2026-10-15).
 * Regras flexibilizadas: 2 faltas seguidas não pontuam; frequência só <40%
 * (crítica <25%); 30 dias sem presença não é fator (só 60+ ou nenhuma no período).
 */
import {
  computeAtRiskMembers,
  type AtRiskMemberRow,
  type AtRiskFrequencyRow,
} from '../lib/member-at-risk';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`PASS ${name}`);
  } else {
    failures++;
    console.log(`FAIL ${name}: esperado ${e}, obtido ${a}`);
  }
}

const WINDOW_START = '2026-07-17';

function row(
  id: string,
  name: string,
  consecutive: number,
  frequencyRate: number | null,
  daysSinceLast: number | null,
  createdAt = '2026-01-01'
): { member: AtRiskMemberRow; freq: AtRiskFrequencyRow } {
  return {
    member: { id, full_name: name, member_type: 'participant', phone: null, consecutive_absences: consecutive },
    freq: {
      id,
      total_meetings: 12,
      attended: 0,
      frequency_rate: frequencyRate,
      last_attendance_date: daysSinceLast === null ? null : '2026-10-15',
      days_since_last: daysSinceLast,
      created_at: `${createdAt}T10:00:00Z`,
    },
  };
}

// Ana: 50% de frequência, 2 faltas seguidas, última presença há 14 dias → NÃO é risco
const ana = row('a1', 'Ana', 2, 50, 14);
// Bia: 33% de frequência, 3 faltas seguidas, última há 20 dias → 25+15 = 40 pts → médio
// (tendência real de saída: frequência baixa + 3 ausências seguidas)
const bia = row('b1', 'Bia', 3, 33.3, 20);
// Caio: 20% de frequência, 2 faltas, última há 20 dias → 40 pts → médio
const caio = row('c1', 'Caio', 2, 20, 20);
// Duda: 10% de frequência, 4+ faltas, 70 dias sem vir → 110 pts → crítico
const duda = row('d1', 'Duda', 5, 10, 70);
// Eva: sem nenhuma presença no período, existe desde antes da janela, sem faltas registradas → 65 pts → alto
const eva = row('e1', 'Eva', 0, null, null);
// Felipe: 45% de frequência, 2 faltas, 100 dias sem vir → 30 pts → médio
const felipe = row('f1', 'Felipe', 2, 45, 100);
// Gabriela: 35% de frequência, 4 faltas, 45 dias → 55 pts → alto
const gabriela = row('g1', 'Gabriela', 4, 35, 45);
// Henrique: membro NOVO (criado dentro da janela) sem nenhuma presença → 40 pts → médio (não crítico)
const henrique = row('h1', 'Henrique', 0, null, null, '2026-09-01');

const input = {
  consecutiveRows: [ana, bia, caio, duda, eva, felipe, gabriela, henrique].map((r) => r.member),
  frequencyRows: [ana, bia, caio, duda, eva, felipe, gabriela, henrique].map((r) => r.freq),
  riskLevelFilter: 'all' as const,
  windowStartIso: WINDOW_START,
};

const result = computeAtRiskMembers(input);

const byId = new Map(result.members.map((m) => [m.id, m]));
check('Ana (aparece as vezes) fora da lista', byId.has('a1'), false);
check('Bia nivel (33% + 3 faltas)', byId.get('b1')?.risk_level, 'medium');
check('Caio nivel', byId.get('c1')?.risk_level, 'medium');
check('Duda nivel', byId.get('d1')?.risk_level, 'critical');
check('Eva nivel (sem presenca no periodo)', byId.get('e1')?.risk_level, 'high');
check('Felipe nivel (100 dias)', byId.get('f1')?.risk_level, 'medium');
check('Gabriela nivel', byId.get('g1')?.risk_level, 'high');
check('Henrique (membro novo) nivel', byId.get('h1')?.risk_level, 'medium');
check('Henrique nao leva fator de periodo vazio', byId.get('h1')?.risk_factors.includes('Sem presença em todo o período'), false);
check('Duda fatores', byId.get('d1')?.risk_factors, ['5 ausências consecutivas', 'Frequência 10% (crítica)', '70 dias sem presença']);
check('summary.total', result.summary.total, 7);
check('summary.critical', result.summary.critical, 1);
check('summary.high', result.summary.high, 2);
check('summary.medium', result.summary.medium, 4);

// Ordem: critical primeiro, depois high (por faltas desc), depois medium (por faltas desc)
check(
  'ordenacao',
  result.members.map((m) => m.id),
  ['d1', 'g1', 'e1', 'b1', 'c1', 'f1', 'h1']
);

// Filtro por nível
const filtered = computeAtRiskMembers({ ...input, riskLevelFilter: 'critical' });
check('filtro critical', filtered.members.map((m) => m.id), ['d1']);

if (failures > 0) {
  console.log(`\n${failures} falha(s)`);
  process.exit(1);
}
console.log('\nTodos os testes passaram.');
