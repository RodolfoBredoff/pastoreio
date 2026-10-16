/**
 * Teste local de computeVisitorFunnel com dados sintéticos.
 * Uso: npx tsx scripts/test-visitor-funnel.ts
 */
import {
  computeVisitorFunnel,
  type FunnelMemberRow,
  type FunnelMemberAttendanceRow,
  type FunnelGuestRow,
  type FunnelGuestAttendanceRow,
} from '../lib/visitor-funnel';

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

// Data fixa para determinismo: 2026-10-15, janela de 180 dias → início 2026-04-18
const TODAY = new Date('2026-10-15T12:00:00Z');

const members: FunnelMemberRow[] = [
  // P1: participante novo, 2 presenças → 2ª visita
  { id: 'p1', full_name: 'Paula', member_type: 'participant', integration_stage: 'novo_visitante', created_at: '2026-05-01T10:00:00Z' },
  // P2: participante novo, 5 presenças → convertido (4+ presenças)
  { id: 'p2', full_name: 'Pedro', member_type: 'participant', integration_stage: 'novo_visitante', created_at: '2026-05-01T10:00:00Z' },
  // P3: convertido manualmente (stage membro) com apenas 1 presença → convertido (regra reduzida)
  { id: 'p3', full_name: 'Marcos', member_type: 'participant', integration_stage: 'membro', created_at: '2026-06-01T10:00:00Z' },
  // P4: visitante registrado, 3 presenças → 3ª visita
  { id: 'p4', full_name: 'Renata', member_type: 'visitor', integration_stage: 'retornou', created_at: '2026-07-01T10:00:00Z' },
  // P5: criado antes da janela → excluído
  { id: 'p5', full_name: 'Antigo', member_type: 'participant', integration_stage: 'membro', created_at: '2026-01-01T10:00:00Z' },
  // P6: criado na janela mas sem presença → excluído
  { id: 'p6', full_name: 'Fantasma', member_type: 'participant', integration_stage: 'novo_visitante', created_at: '2026-08-01T10:00:00Z' },
];

const meetingsByDay = (dates: string[]) => dates;

const p1Dates = meetingsByDay(['2026-05-05', '2026-06-05']);
const p2Dates = meetingsByDay(['2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05']);
const p3Dates = meetingsByDay(['2026-06-10']);
const p4Dates = meetingsByDay(['2026-07-05', '2026-08-05', '2026-09-05']);
const p5Dates = meetingsByDay(['2026-02-05']);

const memberAttendance: FunnelMemberAttendanceRow[] = [
  ...p1Dates.map((d, i) => ({ member_id: 'p1', meeting_id: `m-p1-${i}`, is_present: true, meeting_date: d })),
  ...p2Dates.map((d, i) => ({ member_id: 'p2', meeting_id: `m-p2-${i}`, is_present: true, meeting_date: d })),
  ...p3Dates.map((d, i) => ({ member_id: 'p3', meeting_id: `m-p3-${i}`, is_present: true, meeting_date: d })),
  ...p4Dates.map((d, i) => ({ member_id: 'p4', meeting_id: `m-p4-${i}`, is_present: true, meeting_date: d })),
  ...p5Dates.map((d, i) => ({ member_id: 'p5', meeting_id: `m-p5-${i}`, is_present: true, meeting_date: d })),
  // falta de P6 não conta (is_present false nem existiria)
  { member_id: 'p6', meeting_id: 'm-p6-0', is_present: false, meeting_date: '2026-08-10' },
];

const guests: FunnelGuestRow[] = [
  { id: 'g1', full_name: 'Gabriela', created_at: '2026-08-01T10:00:00Z' },
  { id: 'g2', full_name: 'Gustavo', created_at: '2026-08-01T10:00:00Z' },
  { id: 'g3', full_name: 'Antiga', created_at: '2026-01-01T10:00:00Z' },
];

const guestAttendance: FunnelGuestAttendanceRow[] = [
  { guest_id: 'g1', meeting_id: 'm-g1-0', meeting_date: '2026-08-10' },
  ...[0, 1, 2, 3].map((i) => ({ guest_id: 'g2', meeting_id: `m-g2-${i}`, meeting_date: `2026-08-${10 + i}` })),
  { guest_id: 'g3', meeting_id: 'm-g3-0', meeting_date: '2026-02-10' },
];

const funnel = computeVisitorFunnel({
  periodDays: 180,
  today: TODAY,
  members,
  memberAttendance,
  guests,
  guestAttendance,
});

check('total_visitors', funnel.total_visitors, 6);

const stageOf = (key: string) => funnel.stages.find((s) => s.stage === key)!;
check('visit_1 count', stageOf('visit_1').count, 6);
check('visit_2 count', stageOf('visit_2').count, 4);
check('visit_3 count', stageOf('visit_3').count, 3);
check('visit_4 count', stageOf('visit_4').count, 2);
check('converted count', stageOf('converted').count, 2);

check('visit_1 percentage', stageOf('visit_1').percentage, 100);
check('visit_2 percentage', stageOf('visit_2').percentage, 67);
check('visit_3 percentage', stageOf('visit_3').percentage, 75);
check('visit_4 percentage', stageOf('visit_4').percentage, 67);
check('converted percentage', stageOf('converted').percentage, 100);

check('visit_1 dropoff', stageOf('visit_1').dropoff, 33);
check('visit_4 dropoff', stageOf('visit_4').dropoff, 0);

check('conversion_rate', funnel.conversion_rate, 33);
check('avg_visits_to_conversion', funnel.avg_visits_to_conversion, 3);

// Pessoas por etapa
check('visit_1 inclui guest', stageOf('visit_1').people.some((p) => p.id === 'g1' && p.kind === 'guest'), true);
check('visit_4 pessoas', stageOf('visit_4').people.map((p) => p.id).sort(), ['g2', 'p2']);
check('converted pessoas', stageOf('converted').people.map((p) => p.id).sort(), ['p2', 'p3']);
check('converted sem guests', stageOf('converted').people.every((p) => p.kind === 'member'), true);
check('memberIds sem guests', stageOf('visit_1').memberIds.sort(), ['p1', 'p2', 'p3', 'p4']);
check('guest excluido por data', stageOf('visit_1').people.some((p) => p.id === 'g3'), false);
check('membro antigo excluido', stageOf('visit_1').people.some((p) => p.id === 'p5'), false);
check('sem presenca excluido', stageOf('visit_1').people.some((p) => p.id === 'p6'), false);

if (failures > 0) {
  console.log(`\n${failures} falha(s)`);
  process.exit(1);
}
console.log('\nTodos os testes passaram.');
