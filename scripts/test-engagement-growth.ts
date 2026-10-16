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
  tagRows: tags,
  meetingsInWindow: meetings,
};

// ── Sem filtro de tags ──
const r1 = computeGrowthMetrics(baseInput);

check('totals.peopleEver', r1.totals.peopleEver, 7);
check('totals.uniqueVisitorsEver', r1.totals.uniqueVisitorsEver, 2);
check('totals.membersAll', r1.totals.membersAll, 5);
check('totals.membersActive', r1.totals.membersActive, 4);
check('totals.convertedTotal', r1.totals.convertedTotal, 1);
check('totals.attendedEver', r1.totals.attendedEver, 4);
check('totals.newInWindow', r1.totals.newInWindow, 3);
check('totals.returnedInWindow', r1.totals.returnedInWindow, 1);
check('totals.conversionsInWindow', r1.totals.conversionsInWindow, 1);

const byId = new Map(r1.perMeeting.map((p) => [p.meeting_id, p]));
const m1 = byId.get('m1')!;
const m2 = byId.get('m2')!;
check('m1.totalPresent', m1.totalPresent, 4);
check('m1.newPeople', m1.newPeople, 3);
check('m1.newMembers', m1.newMembers, 1);
check('m1.newGuests', m1.newGuests, 2);
check('m2.totalPresent', m2.totalPresent, 2);
check('m2.newPeople', m2.newPeople, 0);

const curMonth = r1.months[r1.months.length - 1];
const prevMonth = r1.months[r1.months.length - 2];
check('mes atual newPeople', curMonth.newPeople, 0);
check('mes atual returnedVisitors', curMonth.returnedVisitors, 1);
check('mes atual conversions', curMonth.conversions, 1);
check('mes anterior newPeople', prevMonth.newPeople, 3);
check('mes anterior newGuests', prevMonth.newGuests, 2);

check('growthTrend.recentAvg', r1.growthTrend.recentAvg, 2.3);
check('growthTrend.prevAvg', r1.growthTrend.prevAvg, 1);
check('growthTrend.delta', r1.growthTrend.delta, 1.3);

check('frequencia.totalMeetings', r1.memberFrequency?.totalMeetings, 6);
check('frequencia.considered', r1.memberFrequency?.consideredMembers, 4);
const bucketOf = (key: string) => r1.memberFrequency?.buckets.find((b) => b.key === key)?.count;
check('frequencia.assiduo', bucketOf('assiduo'), 1);
check('frequencia.afastado', bucketOf('afastado'), 1);
check('frequencia.ausente_total', bucketOf('ausente_total'), 2);

check('retorno.rate', r1.newVisitorReturn.rate, 50);
check('retorno.returned', r1.newVisitorReturn.returned, 1);
check('retorno.newVisitors', r1.newVisitorReturn.newVisitors, 2);

const lastCumulative = r1.cumulativeByMonth[r1.cumulativeByMonth.length - 1];
check('acumulado final = peopleEver', lastCumulative.total, 7);
const firstCumulative = r1.cumulativeByMonth[0];
check('acumulado inicial', firstCumulative.total, 1);

check('availableTags', r1.availableTags, [{ key: 'célula', values: ['joão'] }]);

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
check('filtro: acumulado inalterado', r2.cumulativeByMonth[r2.cumulativeByMonth.length - 1].total, 7);

// ── Janela com poucos encontros: trend nulo ──
const r3 = computeGrowthMetrics({ ...baseInput, meetingsInWindow: meetings.slice(0, 2) });
check('janela curta: trend delta nulo', r3.growthTrend.delta, null);

if (failures > 0) {
  console.log(`\n${failures} falha(s)`);
  process.exit(1);
}
console.log('\nTodos os testes passaram.');
