/**
 * Verifica e cria alertas automáticos (faltas consecutivas e aniversários)
 * Executado pelo cron sem sessão de usuário - processa TODOS os grupos
 */

import { query, queryMany, queryOne } from '@/lib/db/postgres';
import { sendEmail, buildBirthdayEmailHtml } from '@/lib/email/sender';
import { sendWhatsAppTemplateMessage } from '@/lib/whatsapp/sender';
import { sendPushToLeader } from '@/lib/push/sender';

const CONSECUTIVE_ABSENCES_THRESHOLD = 2;

/**
 * Verifica faltas consecutivas e cria alertas para todos os grupos
 */
export async function checkConsecutiveAbsences(): Promise<number> {
  const groups = await queryMany<{ id: string; name: string; absence_whatsapp_enabled: boolean }>(
    `SELECT id, name, absence_whatsapp_enabled FROM groups`
  );

  let alertsCreated = 0;

  for (const group of groups) {
    const groupLeader = await queryOne<{ id: string; full_name: string; email: string }>(
      `SELECT id, full_name, email FROM leaders WHERE group_id = $1 LIMIT 1`,
      [group.id]
    );

    const members = await queryMany<{ id: string; full_name: string; phone: string | null }>(
      `SELECT id, full_name, phone FROM members 
       WHERE group_id = $1 AND is_active = TRUE`,
      [group.id]
    );

    for (const member of members) {
      const absences = await queryMany<{ meeting_date: string; is_present: boolean }>(
        `SELECT * FROM get_consecutive_absences($1, $2)`,
        [member.id, CONSECUTIVE_ABSENCES_THRESHOLD + 1]
      );

      let consecutiveAbsences = 0;
      for (const absence of absences) {
        if (!absence.is_present) {
          consecutiveAbsences++;
        } else {
          break;
        }
      }

      if (consecutiveAbsences >= CONSECUTIVE_ABSENCES_THRESHOLD) {
        const existingAlert = await query(
          `SELECT id FROM notifications 
           WHERE group_id = $1 
           AND member_id = $2 
           AND notification_type = 'absence_alert'
           AND created_at > NOW() - INTERVAL '7 days'`,
          [group.id, member.id]
        );

        if (existingAlert.rows.length === 0) {
          await query(
            `INSERT INTO notifications (group_id, notification_type, member_id, message)
             VALUES ($1, 'absence_alert', $2, $3)`,
            [
              group.id,
              member.id,
              `${member.full_name} tem ${consecutiveAbsences} faltas consecutivas. Considere entrar em contato.`,
            ]
          );
          alertsCreated++;

          // Enviar WhatsApp ao membro ausente quando habilitado
          if (group.absence_whatsapp_enabled && member.phone) {
            await sendWhatsAppTemplateMessage({
              toPhone: member.phone,
              templateName: 'alerta_falta_membro',
              variables: [member.full_name, group.name],
            });
          }

          // Enviar push notification ao líder
          if (groupLeader?.id) {
            await sendPushToLeader(groupLeader.id, {
              title: 'Alerta de Falta',
              body: `${member.full_name} tem ${consecutiveAbsences} faltas consecutivas.`,
              url: '/alertas',
            });
          }
        }
      }
    }
  }

  return alertsCreated;
}

/**
 * Verifica aniversariantes do dia, cria notificações e envia e-mail ao líder
 */
export async function checkBirthdaysToday(): Promise<number> {
  const groups = await queryMany<{ id: string }>(
    `SELECT id FROM groups`
  );

  let notificationsCreated = 0;
  const today = new Date().toISOString().split('T')[0];

  for (const group of groups) {
    const birthdays = await queryMany<{ id: string; full_name: string; phone: string }>(
      `SELECT * FROM get_birthdays_today($1)`,
      [group.id]
    );

    if (birthdays.length === 0) continue;

    // Buscar dados do grupo e do líder para envio de e-mail
    const groupData = await queryOne<{ name: string }>(
      `SELECT name FROM groups WHERE id = $1`,
      [group.id]
    );

    const leader = await queryOne<{ full_name: string; email: string; phone: string | null }>(
      `SELECT full_name, email, phone FROM leaders WHERE group_id = $1 LIMIT 1`,
      [group.id]
    );

    for (const person of birthdays) {
      const existingNotification = await query(
        `SELECT id FROM notifications 
         WHERE group_id = $1 
         AND member_id = $2 
         AND notification_type = 'birthday'
         AND DATE(created_at) = $3`,
        [group.id, person.id, today]
      );

      if (existingNotification.rows.length === 0) {
        await query(
          `INSERT INTO notifications (group_id, notification_type, member_id, message)
           VALUES ($1, 'birthday', $2, $3)`,
          [
            group.id,
            person.id,
            `🎉 Hoje é aniversário de ${person.full_name}!`,
          ]
        );
        notificationsCreated++;

        const groupName = groupData?.name ?? 'Seu Grupo';

        // Enviar e-mail ao líder do grupo
        if (leader?.email) {
          const html = buildBirthdayEmailHtml({
            leaderName: leader.full_name,
            memberName: person.full_name,
            memberPhone: person.phone || null,
            groupName,
          });

          await sendEmail({
            to: leader.email,
            subject: `🎂 Aniversário de ${person.full_name} hoje!`,
            html,
            text: `Olá ${leader.full_name}! Hoje é aniversário de ${person.full_name}. Envie uma mensagem de parabéns!`,
          });
        }

        // Enviar WhatsApp ao líder do grupo (requer Meta Business Cloud API configurada)
        if (leader?.phone) {
          await sendWhatsAppTemplateMessage({
            toPhone: leader.phone,
            templateName: process.env.WHATSAPP_TEMPLATE_NAME ?? 'aniversario_lider',
            variables: [leader.full_name, person.full_name, groupName],
          });
        }

        // Enviar push notification ao líder
        if (leader) {
          const leaderRow = await queryOne<{ id: string }>(
            `SELECT id FROM leaders WHERE email = $1 AND group_id = $2 LIMIT 1`,
            [leader.email, group.id]
          );
          if (leaderRow?.id) {
            await sendPushToLeader(leaderRow.id, {
              title: `🎂 Aniversário hoje!`,
              body: `${person.full_name} faz aniversário hoje. Envie parabéns!`,
              url: '/alertas',
            });
          }
        }
      }
    }
  }

  return notificationsCreated;
}

/**
 * Detecta visitantes que não aparecem há 2+ encontros sem ter atingido 'membro'.
 */
export async function checkVisitorDropoff(): Promise<number> {
  const groups = await queryMany<{ id: string }>(`SELECT id FROM groups`);
  let alertsCreated = 0;

  for (const group of groups) {
    const staleVisitors = await queryMany<{ id: string; full_name: string }>(
      `SELECT m.id, m.full_name
       FROM members m
       WHERE m.group_id = $1
         AND m.member_type = 'visitor'
         AND m.is_active = TRUE
         AND m.integration_stage != 'membro'
         AND (
           SELECT COUNT(*) FROM attendance a
           JOIN meetings mt ON mt.id = a.meeting_id
           WHERE a.member_id = m.id AND a.is_present = TRUE
             AND mt.group_id = $1
             AND mt.meeting_date >= NOW() - INTERVAL '60 days'
         ) = 0
         AND (
           SELECT COUNT(*) FROM meetings mt2
           WHERE mt2.group_id = $1
             AND mt2.meeting_date >= NOW() - INTERVAL '60 days'
             AND mt2.is_cancelled = FALSE
         ) >= 2`,
      [group.id]
    );

    const groupLeader = await queryOne<{ id: string }>(
      `SELECT id FROM leaders WHERE group_id = $1 LIMIT 1`,
      [group.id]
    );

    for (const visitor of staleVisitors) {
      const existing = await query(
        `SELECT id FROM notifications
         WHERE group_id = $1 AND member_id = $2
           AND notification_type = 'visitor_dropoff'
           AND created_at > NOW() - INTERVAL '14 days'`,
        [group.id, visitor.id]
      );

      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO notifications (group_id, notification_type, member_id, message)
           VALUES ($1, 'visitor_dropoff', $2, $3)`,
          [
            group.id,
            visitor.id,
            `Visitante ${visitor.full_name} não apareceu nos últimos encontros. Considere entrar em contato.`,
          ]
        );
        alertsCreated++;

        // Notificação push ao líder
        if (groupLeader?.id) {
          await sendPushToLeader(groupLeader.id, {
            title: 'Visitante sem retorno',
            body: `${visitor.full_name} não aparece há mais de 60 dias.`,
            url: `/pessoas`,
          });
        }
      }
    }
  }

  return alertsCreated;
}

/**
 * Verifica lembretes pré-encontro e envia WhatsApp individual a membros/visitantes.
 */
export async function checkMeetingReminders(): Promise<number> {
  const groups = await queryMany<{
    id: string;
    name: string;
    reminder_enabled: boolean;
  }>(
    `SELECT id, name, reminder_enabled FROM groups WHERE reminder_enabled = TRUE`
  );

  let remindersSent = 0;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  for (const group of groups) {
    const meeting = await queryOne<{ id: string; meeting_time: string | null }>(
      `SELECT id, meeting_time FROM meetings
       WHERE group_id = $1 AND meeting_date = $2 AND is_cancelled = FALSE
       LIMIT 1`,
      [group.id, tomorrowStr]
    );

    if (!meeting) continue;

    const meetingTime = meeting.meeting_time
      ? meeting.meeting_time.substring(0, 5)
      : '19:00';

    const members = await queryMany<{ id: string; full_name: string; phone: string }>(
      `SELECT id, full_name, phone FROM members
       WHERE group_id = $1 AND is_active = TRUE AND phone IS NOT NULL AND phone != ''`,
      [group.id]
    );

    for (const member of members) {
      const sent = await sendWhatsAppTemplateMessage({
        toPhone: member.phone,
        templateName: 'lembrete_encontro',
        variables: [member.full_name, meetingTime, group.name],
      });
      if (sent) remindersSent++;
    }

    // Enviar link de grupo para o líder por e-mail
    const leader = await queryOne<{ full_name: string; email: string; phone: string | null }>(
      `SELECT full_name, email, phone FROM leaders WHERE group_id = $1 LIMIT 1`,
      [group.id]
    );

    if (leader?.email) {
      const { buildReminderEmailHtml } = await import('@/lib/email/sender');
      const html = buildReminderEmailHtml({
        leaderName: leader.full_name,
        groupName: group.name,
        meetingDate: tomorrowStr,
        meetingTime,
        leaderPhone: leader.phone ?? null,
        memberCount: members.length,
      });

      await sendEmail({
        to: leader.email,
        subject: `📅 Lembrete: encontro do ${group.name} amanhã`,
        html,
        text: `Olá ${leader.full_name}! Lembrete: encontro do ${group.name} amanhã às ${meetingTime}. ${members.length} membros serão notificados.`,
      });
    }
  }

  return remindersSent;
}

/**
 * Envia resumo semanal para os líderes (toda segunda-feira).
 */
export async function checkWeeklySummary(): Promise<number> {
  const groups = await queryMany<{
    id: string;
    name: string;
    weekly_summary_enabled: boolean;
  }>(
    `SELECT id, name, weekly_summary_enabled FROM groups WHERE weekly_summary_enabled = TRUE`
  );

  let summariesSent = 0;

  for (const group of groups) {
    const leader = await queryOne<{ full_name: string; email: string }>(
      `SELECT full_name, email FROM leaders WHERE group_id = $1 LIMIT 1`,
      [group.id]
    );

    if (!leader?.email) continue;

    // Último encontro
    const lastMeeting = await queryOne<{ id: string; meeting_date: string; meeting_time: string | null }>(
      `SELECT id, meeting_date, meeting_time FROM meetings
       WHERE group_id = $1 AND is_cancelled = FALSE
       ORDER BY meeting_date DESC LIMIT 1`,
      [group.id]
    );

    const totalMembers = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM members WHERE group_id = $1 AND is_active = TRUE`,
      [group.id]
    );

    let lastMeetingStats: { presentCount: number; totalCount: number } | null = null;
    if (lastMeeting) {
      const stats = await queryOne<{ present_count: string; total_count: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE a.is_present = TRUE) AS present_count,
           COUNT(*) AS total_count
         FROM attendance a WHERE a.meeting_id = $1`,
        [lastMeeting.id]
      );
      if (stats) {
        lastMeetingStats = {
          presentCount: parseInt(stats.present_count),
          totalCount: parseInt(stats.total_count),
        };
      }
    }

    // Aniversários da semana
    const weekBirthdays = await queryMany<{ full_name: string }>(
      `SELECT full_name FROM members
       WHERE group_id = $1 AND is_active = TRUE
         AND birth_date IS NOT NULL
         AND EXTRACT(MONTH FROM birth_date::date) = EXTRACT(MONTH FROM NOW())
         AND EXTRACT(DAY FROM birth_date::date) BETWEEN EXTRACT(DAY FROM NOW()) AND EXTRACT(DAY FROM NOW()) + 7`,
      [group.id]
    );

    // Visitantes por estágio
    const visitorsByStage = await queryMany<{ integration_stage: string; count: string }>(
      `SELECT integration_stage, COUNT(*) AS count
       FROM members
       WHERE group_id = $1 AND member_type = 'visitor' AND is_active = TRUE AND integration_stage != 'membro'
       GROUP BY integration_stage`,
      [group.id]
    );

    // Membros com faltas consecutivas
    const absentAlerts = await queryMany<{ message: string }>(
      `SELECT message FROM notifications
       WHERE group_id = $1 AND notification_type = 'absence_alert'
         AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC LIMIT 5`,
      [group.id]
    );

    const { buildWeeklySummaryHtml } = await import('@/lib/email/sender');
    const html = buildWeeklySummaryHtml({
      leaderName: leader.full_name,
      groupName: group.name,
      lastMeeting: lastMeeting
        ? { date: lastMeeting.meeting_date, ...lastMeetingStats }
        : null,
      totalMembers: parseInt(totalMembers?.count ?? '0'),
      weekBirthdays: weekBirthdays.map((b) => b.full_name),
      visitorsByStage,
      absentAlerts: absentAlerts.map((a) => a.message),
    });

    await sendEmail({
      to: leader.email,
      subject: `📊 Resumo Semanal — ${group.name}`,
      html,
      text: `Resumo semanal do grupo ${group.name}. Acesse o aplicativo para mais detalhes.`,
    });

    summariesSent++;
  }

  return summariesSent;
}

/**
 * Executa todas as verificações de alertas (para todos os grupos)
 */
export async function runAllChecks(): Promise<{
  absenceAlerts: number;
  birthdayNotifications: number;
  visitorDropoffs: number;
}> {
  const [absenceAlerts, birthdayNotifications, visitorDropoffs] = await Promise.all([
    checkConsecutiveAbsences(),
    checkBirthdaysToday(),
    checkVisitorDropoff(),
  ]);

  return {
    absenceAlerts,
    birthdayNotifications,
    visitorDropoffs,
  };
}
