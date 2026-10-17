/**
 * Teste local de computeGrowthMetrics com dados sintéticos.
 * Uso: npx tsx scripts/test-engagement-growth.ts
 */
import {
  computeGrowthMetrics,
  type GrowthMemberRow,
  type GrowthAttendanceRow,
  type GrowthGuestRow,
  type GrowthTagRow,
  type GrowthMeetingRow,
} from '../lib/engagement-growth';

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

// Chaves de mês: months[0] = 5 meses atrás ... months[5] = mês atual
const now = new Date();
const monthKeyOf = (monthsAgo: number) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  return d.toISOString().slice(0, 7);
};
const M = (monthsAgo: number, day: number) => `${monthKeyOf(monthsAgo)}-${String(day).padStart(2, '0')}`;

const members: GrowthMemberRow[] = [
  { id: 'A', member_type: 'participant', integration_stage: 'novo_visitante', is_active: true, created_at: `${M(8, 10)}T10:00:00Z`, full_name: 'Ana' },
  { id: 'B', member_type: 'participant', integration_stage: 'novo_visitante', is_active: true, created_at: `${M(4, 1)}T10:00:00Z`, full_name: 'Bia' },
  { id: 'C', member_type: 'participant', integration_stage: 'novo_visitante', is_active: true, created_at: `${M(3, 1)}T10:00:00Z`, full_name: 'Caio' },
  { id: 'D', member_type: 'participant', integration_stage: 'novo_visitante', is_active: false, created_at: `${M(3, 2)}T10:00:00Z`, full_name: 'Duda' },
  { id: 'E', member_type: 'participant', integration_stage: 'membro', is_active: true, created_at: `${M(0, 3)}T10:00:00Z`, full_name: 'Eva' },
  { id: 'F', member_type: 'visitor', integration_stage: 'retornou', is_active: true, created_at: `${M(8, 12)}T10:00:00Z`, full_name: 'Felipe' },
];

const meetings: GrowthMeetingRow[] = [
  { id: 'm6', meeting_date: M(5, 5), title: 'E6', meeting_type: 'regular' },
  { id: 'm5', meeting_date: M(4, 5), title: 'E5', meeting_type: 'regular' },
  { id: 'm4', meeting_date: M(3, 5), title: 'E4', meeting_type: 'regular' },
  { id: 'm3', meeting_date: M(2, 5), title: 'E3', meeting_type: 'regular' },
  { id: 'm1', meeting_date: M(1, 5), title: 'E1', meeting_type: 'regular' },
  { id: 'm2', meeting_date: M(0, 10), title: 'E2', meeting_type: 'regular' },
];
// m0 está fora da janela (7 meses atrás) — presença antiga de A
const outsideMeeting: GrowthMeetingRow = { id: 'm0', meeting_date: M(7, 5), title: 'E0', meeting_type: 'regular' };

const attendance: GrowthAttendanceRow[] = [
  // A: presente em todos (primeira presença fora da janela)
  ...meetings.map((m) => ({ member_id: 'A', meeting_id: m.id, is_present: true, meeting_date: m.meeting_date })),
  { member_id: 'A', meeting_id: outsideMeeting.id, is_present: true, meeting_date: outsideMeeting.meeting_date },
  // B: presente em m1, falta em m2 (primeira presença dentro da janela)
  { member_id: 'B', meeting_id: 'm1', is_present: true, meeting_date: M(1, 5) },
  { member_id: 'B', meeting_id: 'm2', is_present: false, meeting_date: M(0, 10) },
  // F: visitante registrado (member_type=visitor) que voltou — 2 presenças
  { member_id: 'F', meeting_id: 'm1', is_present: true, meeting_date: M(1, 5) },
  { member_id: 'F', meeting_id: 'm2', is_present: true, meeting_date: M(0, 10) },
];

const guests: GrowthGuestRow[] = [
  { guest_id: 'v1', meeting_id: 'm1', meeting_date: M(1, 5) },
  { guest_id: 'v2', meeting_id: 'm1', meeting_date: M(1, 5) },
  { guest_id: 'v2', meeting_id: 'm2', meeting_date: M(0, 10) },
];

const tags: GrowthTagRow[] = [{ member_id: 'B', tag_key: 'célula', tag_value: 'joão' }];

const baseInput = {
  windowMonths: 6,
  tags: null,
  members,
  attendanceRows: attendance,
  guestRows: guests,
  visitorCount: 2,
  guestCreatedAts: [`${M(1, 6)}T10:00:00Z`, `${M(1, 6)}T10:00:00Z`],
  guestNames: [
    { id: 'v1', full_name: 'Visitante 1', created_at: `${M(1, 6)}T10:00:00Z` },
    { id: 'v2', full_name: 'Visitante 2', created_at: `${M(1, 6)}T10:00:00Z` },
  ],
  tagRows: tags,
  meetingsInWindow: meetings,
};

// ── Sem filtro de tags ──
const r1 = computeGrowthMetrics(baseInput);

check('totals.peopleEver', r1.totals.peopleEver, 8);
check('totals.uniqueVisitorsEver', r1.totals.uniqueVisitorsEver, 2);
check('totals.membersAll', r1.totals.membersAll, 6);
check('totals.membersActive', r1.totals.membersActive, 4);
check('totals.convertedTotal', r1.totals.convertedTotal, 1);
check('totals.attendedEver', r1.totals.attendedEver, 5);
check('totals.newInWindow', r1.totals.newInWindow, 4);
check('totals.returnedInWindow', r1.totals.returnedInWindow, 2);
check('totals.conversionsInWindow', r1.totals.conversionsInWindow, 0);

const byId = new Map(r1.perMeeting.map((p) => [p.meeting_id, p]));
const m1 = byId.get('m1')!;
const m2 = byId.get('m2')!;
check('m1.totalPresent', m1.totalPresent, 5);
check('m1.newPeople', m1.newPeople, 4);
check('m1.newMembers', m1.newMembers, 2);
check('m1.newGuests', m1.newGuests, 2);
check('m2.totalPresent', m2.totalPresent, 3);
check('m2.newPeople', m2.newPeople, 0);

const curMonth = r1.months[r1.months.length - 1];
const prevMonth = r1.months[r1.months.length - 2];
check('mes atual newPeople', curMonth.newPeople, 0);
check('mes atual returnedVisitors', curMonth.returnedVisitors, 2);
check('mes atual conversions', curMonth.conversions, 0);
check('mes anterior newPeople', prevMonth.newPeople, 4);
check('mes anterior newGuests', prevMonth.newGuests, 2);
check('mes anterior newMembers', prevMonth.newMembers, 2);

check('growthTrend.recentAvg', r1.growthTrend.recentAvg, 3);
check('growthTrend.prevAvg', r1.growthTrend.prevAvg, 1);
check('growthTrend.delta', r1.growthTrend.delta, 2);

check('frequencia.totalMeetings', r1.memberFrequency?.totalMeetings, 6);
check('frequencia.considered', r1.memberFrequency?.consideredMembers, 4);
const bucketOf = (key: string) => r1.memberFrequency?.buckets.find((b) => b.key === key)?.count;
check('frequencia.assiduo', bucketOf('assiduo'), 1);
check('frequencia.afastado', bucketOf('afastado'), 1);
check('frequencia.ausente_total', bucketOf('ausente_total'), 2);

check('retorno.rate', r1.newVisitorReturn.rate, 67);
check('retorno.returned', r1.newVisitorReturn.returned, 2);
check('retorno.newVisitors', r1.newVisitorReturn.newVisitors, 3);

const lastCumulative = r1.cumulativeByMonth[r1.cumulativeByMonth.length - 1];
check('acumulado final = peopleEver', lastCumulative.total, 8);
const firstCumulative = r1.cumulativeByMonth[0];
check('acumulado inicial', firstCumulative.total, 2);

check('availableTags', r1.availableTags, [{ key: 'célula', values: ['joão'] }]);

// ── Listas dos cartões clicáveis ──
check('lists.peopleEver tam', r1.lists.peopleEver.length, 8);
check('lists.peopleEver primeiro', r1.lists.peopleEver[0], { name: 'Ana', kind: 'Membro', active: true });
check('lists.visitors tam', r1.lists.visitors.length, 2);
check('lists.visitors v2', r1.lists.visitors.find((v) => v.name === 'Visitante 2')?.presences, 2);
check('lists.membersActive', r1.lists.membersActive, ['Ana', 'Bia', 'Caio', 'Eva']);
check('lists.pathToMember tam', r1.lists.pathToMember.length, 2);
check('lists.pathToMember[0]', r1.lists.pathToMember[0], { name: 'Felipe', kind: 'Voltou', presences: 2 });
check('lists.pathToMember inclui membro', r1.lists.pathToMember.some((p) => p.name === 'Eva' && p.kind === 'Membro'), true);
check('lists.newInWindow tam', r1.lists.newInWindow.length, 4);

// ── Com filtro de tags (só B) ──
const r2 = computeGrowthMetrics({ ...baseInput, tags: { 'célula': ['joão'] } });
check('filtro: tagFilterActive', r2.tagFilterActive, true);
check('filtro: m1.membersPresent', r2.perMeeting.find((p) => p.meeting_id === 'm1')?.membersPresent, 1);
check('filtro: m1.newMembers', r2.perMeeting.find((p) => p.meeting_id === 'm1')?.newMembers, 1);
check('filtro: m2.membersPresent', r2.perMeeting.find((p) => p.meeting_id === 'm2')?.membersPresent, 0);
check('filtro: attendedEver', r2.totals.attendedEver, 3);
check('filtro: frequencia.considered', r2.memberFrequency?.consideredMembers, 1);
check('filtro: frequencia.afastado', r2.memberFrequency?.buckets.find((b) => b.key === 'afastado')?.count, 1);
check('filtro: mes anterior newMembers', r2.months[r2.months.length - 2].newMembers, 1);
check('filtro: acumulado inalterado', r2.cumulativeByMonth[r2.cumulativeByMonth.length - 1].total, 8);
check('filtro: lists.membersActive', r2.lists.membersActive, ['Bia']);
check('filtro: lists.pathToMember vazio', r2.lists.pathToMember.length, 0);
check('filtro: lists.newInWindow (visitantes sempre)', r2.lists.newInWindow.length, 3);

// ── Janela de 3 meses (mecânica do filtro de janela) ──
const r4 = computeGrowthMetrics({ ...baseInput, windowMonths: 3 });
check('janela3: perMeeting tam', r4.perMeeting.length, 3);
check('janela3: months tam', r4.months.length, 3);
check('janela3: months[0] = cur-2', r4.months[0].month, monthKeyOf(2));
check('janela3: newInWindow', r4.totals.newInWindow, 4);
check('janela3: trend delta nulo (<6 encontros)', r4.growthTrend.delta, null);

// ── Janela com poucos encontros: trend nulo ──
const r3 = computeGrowthMetrics({ ...baseInput, meetingsInWindow: meetings.slice(0, 2) });
check('janela curta: trend delta nulo', r3.growthTrend.delta, null);

// ══════════════════════════════════════════════════════════════════════════════
// Cenários com JANELA EXPLÍDITA (from/to) e datas fixas — para filtro de mês/
// trimestre da página. Datas escolhidas sem depender de "hoje".
// ══════════════════════════════════════════════════════════════════════════════

const wMembers: GrowthMemberRow[] = [
  // P1: participante com 5 presenças — NÃO conta como "virou membro" (já era membro)
  { id: 'P1', member_type: 'participant', integration_stage: 'novo_visitante', is_active: true, created_at: '2026-01-05T10:00:00Z', full_name: 'Paulo' },
  // V1: visitante cadastrado — 2ª presença em março (volta em março)
  { id: 'V1', member_type: 'visitor', integration_stage: 'retornou', is_active: true, created_at: '2026-02-12T10:00:00Z', full_name: 'Vera' },
  // V2: visitante cadastrado — 5ª presença em 29/03 (vira membro em março, regra das 5)
  { id: 'V2', member_type: 'visitor', integration_stage: 'integrando', is_active: true, created_at: '2026-01-12T10:00:00Z', full_name: 'Vitor' },
];

const wMeetings: GrowthMeetingRow[] = [
  { id: 'wfeb', meeting_date: '2026-02-10', title: 'Fev', meeting_type: 'regular' },
  { id: 'wmar1', meeting_date: '2026-03-05', title: 'Mar 1', meeting_type: 'regular' },
  { id: 'wmar2', meeting_date: '2026-03-15', title: 'Mar 2', meeting_type: 'regular' },
  { id: 'wmar3', meeting_date: '2026-03-29', title: 'Mar 3', meeting_type: 'regular' },
  // abril NÃO pertence à janela — precisa ser excluído pelo limite superior
  { id: 'wapr', meeting_date: '2026-04-02', title: 'Abr', meeting_type: 'regular' },
];

const wAttendance: GrowthAttendanceRow[] = [
  { member_id: 'P1', meeting_id: 'wfeb', is_present: true, meeting_date: '2026-02-10' },
  { member_id: 'P1', meeting_id: 'wmar1', is_present: true, meeting_date: '2026-03-05' },
  { member_id: 'P1', meeting_id: 'wmar2', is_present: true, meeting_date: '2026-03-15' },
  { member_id: 'P1', meeting_id: 'wmar3', is_present: true, meeting_date: '2026-03-29' },
  { member_id: 'P1', meeting_id: 'wapr', is_present: true, meeting_date: '2026-04-02' },
  // V1: 1ª presença 10/02; 2ª em 05/03 (voltou em março)
  { member_id: 'V1', meeting_id: 'wfeb', is_present: true, meeting_date: '2026-02-10' },
  { member_id: 'V1', meeting_id: 'wmar1', is_present: true, meeting_date: '2026-03-05' },
  { member_id: 'V1', meeting_id: 'wmar2', is_present: true, meeting_date: '2026-03-20' },
  // V2: 1ª 10/01 (fora das reuniões listadas), 2ª 10/02, 3ª-5ª em março; 5ª em 29/03
  { member_id: 'V2', meeting_id: 'wjan', is_present: true, meeting_date: '2026-01-10' },
  { member_id: 'V2', meeting_id: 'wfeb', is_present: true, meeting_date: '2026-02-10' },
  { member_id: 'V2', meeting_id: 'wmar1', is_present: true, meeting_date: '2026-03-05' },
  { member_id: 'V2', meeting_id: 'wmar2', is_present: true, meeting_date: '2026-03-15' },
  { member_id: 'V2', meeting_id: 'wmar3', is_present: true, meeting_date: '2026-03-29' },
];

const wGuests: GrowthGuestRow[] = [
  // G1: novo em março, voltou em abril (2ª presença fora da janela)
  { guest_id: 'g1', meeting_id: 'wmar1', meeting_date: '2026-03-05' },
  { guest_id: 'g1', meeting_id: 'wapr', meeting_date: '2026-04-02' },
  // G2: novo em março, só 1 presença
  { guest_id: 'g2', meeting_id: 'wmar1', meeting_date: '2026-03-05' },
  // G3: primeira (e única) presença em abril — fora da janela
  { guest_id: 'g3', meeting_id: 'wapr', meeting_date: '2026-04-02' },
];

const wBase = {
  windowMonths: 6,
  tags: null,
  members: wMembers,
  attendanceRows: wAttendance,
  guestRows: wGuests,
  visitorCount: 3,
  guestCreatedAts: ['2026-03-01T10:00:00Z', '2026-03-01T10:00:00Z', '2026-04-01T10:00:00Z'],
  guestNames: [
    { id: 'g1', full_name: 'G1', created_at: '2026-03-01T10:00:00Z' },
    { id: 'g2', full_name: 'G2', created_at: '2026-03-01T10:00:00Z' },
    { id: 'g3', full_name: 'G3', created_at: '2026-04-01T10:00:00Z' },
  ],
  tagRows: [],
  meetingsInWindow: wMeetings,
};

// ── Janela explícita: só março/2026 ──
const w1 = computeGrowthMetrics({ ...wBase, windowFromIso: '2026-03-01', windowToIso: '2026-03-31' });

check('janela-explícita: months = 1 mês', w1.months.length, 1);
check('janela-explícita: month key', w1.months[0].month, '2026-03');
check('janela-explícita: perMeeting exclui fev/abr', w1.perMeeting.length, 3);
check('janela-explícita: windowMonths = span', w1.windowMonths, 1);
check('janela-explícita: perMeeting sem encontro de abril', w1.perMeeting.some((p) => p.meeting_id === 'wapr'), false);

const wMar = w1.months[0];
check('janela-explícita: mar newPeople (G1+G2)', wMar.newPeople, 2);
check('janela-explícita: mar newGuests', wMar.newGuests, 2);
check('janela-explícita: mar newMembers', wMar.newMembers, 0);
check('janela-explícita: mar voltou (V1, 2ª presença 05/03)', wMar.returnedVisitors, 1);
check('janela-explícita: mar virou membro (V2, 5ª presença 29/03)', wMar.conversions, 1);

check('janela-explícita: totals.newInWindow', w1.totals.newInWindow, 2);
check('janela-explícita: returnedInWindow', w1.totals.returnedInWindow, 1);
check('janela-explícita: conversionsInWindow', w1.totals.conversionsInWindow, 1);
check('janela-explícita: retorno newVisitors (G1+G2)', w1.newVisitorReturn.newVisitors, 2);
check('janela-explícita: retorno returned (G1)', w1.newVisitorReturn.returned, 1);
check('janela-explícita: retorno rate', w1.newVisitorReturn.rate, 50);
check('janela-explícita: trend nulo (3 encontros)', w1.growthTrend.delta, null);

// Acumulado em janela curta: estende 5 meses para trás (out/2025..mar/2026)
check('janela-explícita: cumulativo estendido (6 pontos)', w1.cumulativeByMonth.length, 6);
check('janela-explícita: cumulativo primeiro mês', w1.cumulativeByMonth[0].month, '2025-10');
// G3 (criada em abril) ainda não existia no fim de março: 5, não peopleEver(6)
check('janela-explícita: cumulativo final (sem G3 de abril)', w1.cumulativeByMonth[w1.cumulativeByMonth.length - 1].total, 5);

// ── Janela explícita: fev + mar/2026 (dois meses) ──
const w2 = computeGrowthMetrics({ ...wBase, windowFromIso: '2026-02-01', windowToIso: '2026-03-31' });
check('janela-2-meses: months = 2', w2.months.length, 2);
check('janela-2-meses: perMeeting = 4 (fev + 3 de março)', w2.perMeeting.length, 4);
check('janela-2-meses: fev voltou (V2, 2ª presença 10/02)', w2.months[0].returnedVisitors, 1);
check('janela-2-meses: fev virou membro', w2.months[0].conversions, 0);
check('janela-2-meses: mar voltou', w2.months[1].returnedVisitors, 1);
check('janela-2-meses: mar virou membro', w2.months[1].conversions, 1);
check('janela-2-meses: newInWindow (P1+V1+G1+G2)', w2.totals.newInWindow, 4);
check('janela-2-meses: cumulativo estendido (7 pontos)', w2.cumulativeByMonth.length, 7);

// ── Janela explícita: só abril/2026 — primeiro encontro (wapr) entra, nenhum "novo" ──
const w3 = computeGrowthMetrics({ ...wBase, windowFromIso: '2026-04-01', windowToIso: '2026-04-30' });
check('janela-abril: perMeeting = 1', w3.perMeeting.length, 1);
check('janela-abril: newPeople = 1 (G3)', w3.months[0].newPeople, 1);
check('janela-abril: G3 conta como novo (1ª presença em abril)', w3.totals.newInWindow, 1);
check('janela-abril: voltou = 1 (G1, 2ª presença em abril)', w3.months[0].returnedVisitors, 1);

if (failures > 0) {
  console.log(`\n${failures} falha(s)`);
  process.exit(1);
}
console.log('\nTodos os testes passaram.');
