/**
 * Quais encontros entram nos relatórios de engajamento.
 *
 * Regra: o encontro já aconteceu (data <= hoje) OU, sendo de data futura, tem alguma
 * PRESENÇA de verdade registrada (membro presente ou visitante avulso).
 *
 * Por que "presença" e não "qualquer registro":
 * a Agenda grava a chamada de todos os membros como ausentes sempre que o líder edita
 * um encontro (inclusive os futuros). Contar essas linhas faria todo encontro futuro
 * editado aparecer no gráfico como 100% de faltas.
 *
 * Por que incluir futuros com presença: se alguém lança a chamada em um encontro de data
 * futura (data errada, chamada antecipada), o dado existe e precisa aparecer, em vez de o
 * relatório parecer ignorar a chamada salva.
 *
 * Use esta mesma expressão em TODAS as consultas de engajamento (engagement, growth,
 * period-detail) para os gráficos não divergirem entre si.
 * A tabela de encontros precisa estar acessível como `meetings`.
 */
export const MEETING_ENGAGEMENT_VISIBILITY = `(
  meeting_date <= CURRENT_DATE
  OR EXISTS (SELECT 1 FROM attendance a WHERE a.meeting_id = meetings.id AND a.is_present = TRUE)
  OR EXISTS (SELECT 1 FROM attendance_guests ag WHERE ag.meeting_id = meetings.id)
)`;

/** Versão em uma linha, pronta para interpolar em SQL. */
export const MEETING_ENGAGEMENT_VISIBILITY_SQL = MEETING_ENGAGEMENT_VISIBILITY.replace(/\s*\n\s*/g, ' ');
