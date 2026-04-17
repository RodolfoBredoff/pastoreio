/**
 * Módulo de envio de e-mails via AWS SES (Simple Email Service).
 * Requer as seguintes variáveis de ambiente:
 *   - AWS_REGION (ex: us-east-1)
 *   - AWS_SES_FROM_EMAIL: endereço remetente verificado no SES (ex: noreply@seudominio.com)
 *   - AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY (ou IAM Role na EC2)
 *
 * Caso o SES não esteja configurado, o envio é ignorado com log de aviso.
 */

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envia um e-mail via AWS SES.
 * Retorna true em caso de sucesso, false caso SES não esteja configurado ou ocorra erro.
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!fromEmail) {
    console.warn('[Email] AWS_SES_FROM_EMAIL não configurado. E-mail não enviado:', options.subject);
    return false;
  }

  try {
    // Import dinâmico para não impactar bundle se SES não for usado
    const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');

    const client = new SESClient({ region });

    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: {
        ToAddresses: [options.to],
      },
      Message: {
        Subject: {
          Data: options.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: options.html,
            Charset: 'UTF-8',
          },
          ...(options.text
            ? {
                Text: {
                  Data: options.text,
                  Charset: 'UTF-8',
                },
              }
            : {}),
        },
      },
    });

    await client.send(command);
    return true;
  } catch (error) {
    console.error('[Email] Erro ao enviar e-mail:', error);
    return false;
  }
}

const BIRTHDAY_EMAIL_MESSAGES = [
  (name: string) => `🎉 Feliz aniversário, ${name}! Que este dia seja repleto de alegria e bênçãos. Que Deus continue abençoando sua vida! 🙏✨`,
  (name: string) => `🎂 Parabéns, ${name}! Hoje é um dia especial para celebrar você. Desejamos muita felicidade e que todos os seus sonhos se realizem! 💙🎈`,
  (name: string) => `🎊 ${name}, feliz aniversário! Que este novo ano de vida seja marcado pela presença de Deus e por momentos inesquecíveis. Abraços! 🙌❤️`,
  (name: string) => `🎁 Parabéns pelo seu dia, ${name}! Que você seja cercado de pessoas queridas e que este novo ciclo traga muitas conquistas. Deus te abençoe! 🌟`,
  (name: string) => `🎈 Feliz aniversário, ${name}! Hoje celebramos você e toda a alegria que você traz para nossas vidas. Que este dia seja especial! 💐🎉`,
];

function buildBirthdayWhatsAppUrl(phone: string, firstName: string): string {
  const digits = phone.replace(/\D/g, '');
  const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
  const msgFn = BIRTHDAY_EMAIL_MESSAGES[Math.floor(Math.random() * BIRTHDAY_EMAIL_MESSAGES.length)];
  return `https://wa.me/${fullNumber}?text=${encodeURIComponent(msgFn(firstName))}`;
}

/**
 * Gera o HTML do e-mail de lembrete pré-encontro para o líder.
 */
export function buildReminderEmailHtml(params: {
  leaderName: string;
  groupName: string;
  meetingDate: string;
  meetingTime: string;
  leaderPhone: string | null;
  memberCount: number;
}): string {
  const [year, month, day] = params.meetingDate.split('-');
  const formattedDate = `${day}/${month}/${year}`;

  // Link pré-composto para o líder postar no grupo do WhatsApp
  const groupMessage = `📅 Lembrando que amanhã, ${formattedDate} às ${params.meetingTime}, temos nosso encontro do ${params.groupName}. Esperamos você! 🙏`;
  const waGroupUrl = params.leaderPhone
    ? `https://wa.me/${params.leaderPhone.replace(/\D/g, '')}?text=${encodeURIComponent(groupMessage)}`
    : null;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f8; padding: 24px; color: #333; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.10);">
    <div style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); padding: 28px 32px; text-align: center;">
      <div style="font-size: 48px; line-height: 1; margin-bottom: 8px;">📅</div>
      <h2 style="color: #fff; margin: 0; font-size: 22px; font-weight: 700;">Lembrete de Encontro</h2>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 16px; font-size: 15px;">Olá, <strong>${params.leaderName}</strong>!</p>
      <p style="margin: 0 0 8px; font-size: 16px;">
        O encontro do <strong>${params.groupName}</strong> está marcado para <strong>amanhã</strong>:
      </p>
      <div style="background: #f0f7ff; border-left: 4px solid #2563eb; padding: 16px; border-radius: 4px; margin: 16px 0;">
        <p style="margin: 0; font-size: 16px; font-weight: 700; color: #1d4ed8;">${formattedDate} às ${params.meetingTime}</p>
      </div>
      <p style="margin: 0 0 24px; font-size: 14px; color: #666;">
        ${params.memberCount} membros foram notificados individualmente por WhatsApp.<br>
        Clique abaixo para postar o lembrete no grupo do WhatsApp também:
      </p>
      ${
        waGroupUrl
          ? `<div style="text-align: center; margin-bottom: 8px;">
              <a href="${waGroupUrl}"
                style="display: inline-block; background: #25D366; color: #fff; text-decoration: none;
                       padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 15px;
                       box-shadow: 0 2px 8px rgba(37,211,102,0.35);">
                💬 Postar no Grupo do WhatsApp
              </a>
            </div>
            <p style="font-size: 12px; color: #aaa; text-align: center; margin: 8px 0 0;">
              A mensagem já estará preenchida — escolha o grupo e envie!
            </p>`
          : `<p style="font-size: 13px; color: #999; font-style: italic; text-align: center;">
              Cadastre seu número de telefone na conta para receber o link de postagem no grupo.
            </p>`
      }
      <hr style="margin: 28px 0; border: none; border-top: 1px solid #eee;">
      <p style="font-size: 11px; color: #bbb; margin: 0; text-align: center;">
        Pastoreio — lembrete automático de encontro<br>
        Grupo <em>${params.groupName}</em>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Gera o HTML do resumo semanal para o líder.
 */
export function buildWeeklySummaryHtml(params: {
  leaderName: string;
  groupName: string;
  lastMeeting: { date: string; presentCount?: number; totalCount?: number } | null;
  totalMembers: number;
  weekBirthdays: string[];
  visitorsByStage: { integration_stage: string; count: string }[];
  absentAlerts: string[];
}): string {
  const stageLabels: Record<string, string> = {
    novo_visitante: 'Novos Visitantes',
    retornou: 'Retornaram',
    integrando: 'Em Integração',
  };

  const formatDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  const attendanceSection = params.lastMeeting
    ? `
    <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px; font-size: 14px; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">Último Encontro (${formatDate(params.lastMeeting.date)})</h3>
      ${
        params.lastMeeting.presentCount !== undefined
          ? `<p style="margin: 0; font-size: 20px; font-weight: 700; color: #1f2937;">
              ${params.lastMeeting.presentCount} <span style="font-size: 14px; color: #6b7280; font-weight: 400;">/ ${params.lastMeeting.totalCount} presentes</span>
             </p>
             ${params.lastMeeting.totalCount ? `<p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">Taxa: ${Math.round((params.lastMeeting.presentCount / params.lastMeeting.totalCount) * 100)}%</p>` : ''}`
          : `<p style="margin: 0; color: #6b7280; font-size: 14px;">Sem dados de presença registrados.</p>`
      }
    </div>`
    : `<p style="color: #6b7280; font-size: 14px;">Nenhum encontro registrado ainda.</p>`;

  const birthdaysSection = params.weekBirthdays.length > 0
    ? `<div style="background: #fffbeb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px; font-size: 14px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">🎂 Aniversariantes da Semana</h3>
        <p style="margin: 0; font-size: 14px; color: #374151;">${params.weekBirthdays.join(', ')}</p>
       </div>`
    : '';

  const visitorsSection = params.visitorsByStage.length > 0
    ? `<div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px; font-size: 14px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">👥 Visitantes em Acompanhamento</h3>
        ${params.visitorsByStage.map(v => `<p style="margin: 0 0 4px; font-size: 14px; color: #374151;">
          <strong>${stageLabels[v.integration_stage] ?? v.integration_stage}:</strong> ${v.count}
        </p>`).join('')}
       </div>`
    : '';

  const absentsSection = params.absentAlerts.length > 0
    ? `<div style="background: #fff1f2; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px; font-size: 14px; color: #9f1239; text-transform: uppercase; letter-spacing: 0.5px;">⚠️ Alertas de Faltas</h3>
        ${params.absentAlerts.map(a => `<p style="margin: 0 0 4px; font-size: 13px; color: #374151;">• ${a}</p>`).join('')}
       </div>`
    : '';

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f8; padding: 24px; color: #333; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.10);">
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 32px; text-align: center;">
      <div style="font-size: 48px; line-height: 1; margin-bottom: 8px;">📊</div>
      <h2 style="color: #fff; margin: 0; font-size: 22px; font-weight: 700;">Resumo Semanal</h2>
      <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">${params.groupName}</p>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 24px; font-size: 15px;">Olá, <strong>${params.leaderName}</strong>! Aqui está o resumo da semana do grupo:</p>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <h3 style="margin: 0 0 4px; font-size: 14px; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">Total de Membros</h3>
        <p style="margin: 0; font-size: 24px; font-weight: 700; color: #1f2937;">${params.totalMembers}</p>
      </div>
      ${attendanceSection}
      ${birthdaysSection}
      ${visitorsSection}
      ${absentsSection}
      <hr style="margin: 28px 0; border: none; border-top: 1px solid #eee;">
      <p style="font-size: 11px; color: #bbb; margin: 0; text-align: center;">
        Pastoreio — resumo semanal automático<br>
        Grupo <em>${params.groupName}</em>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Gera o HTML do e-mail de aniversário para o líder.
 */
export function buildBirthdayEmailHtml(params: {
  leaderName: string;
  memberName: string;
  memberPhone: string | null;
  groupName: string;
}): string {
  const firstName = params.memberName.split(' ')[0];
  const whatsappUrl = params.memberPhone
    ? buildBirthdayWhatsAppUrl(params.memberPhone, firstName)
    : null;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f8; padding: 24px; color: #333; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.10);">
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 28px 32px; text-align: center;">
      <div style="font-size: 48px; line-height: 1; margin-bottom: 8px;">🎂</div>
      <h2 style="color: #fff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">Aniversário hoje!</h2>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 16px; font-size: 15px;">Olá, <strong>${params.leaderName}</strong>!</p>
      <p style="margin: 0 0 8px; font-size: 16px;">
        Hoje é aniversário de <strong>${params.memberName}</strong> do grupo
        <em style="color: #7c3aed;">${params.groupName}</em>. 🎉
      </p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #666;">
        Aproveite para enviar uma mensagem de parabéns e mostrar que você está pensando nele(a)!
      </p>
      ${
        whatsappUrl
          ? `<div style="text-align: center; margin-bottom: 8px;">
              <a href="${whatsappUrl}"
                style="display: inline-block; background: #25D366; color: #fff; text-decoration: none;
                       padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 15px;
                       letter-spacing: 0.2px; box-shadow: 0 2px 8px rgba(37,211,102,0.35);">
                💬 Enviar Parabéns pelo WhatsApp
              </a>
            </div>
            <p style="font-size: 12px; color: #aaa; text-align: center; margin: 8px 0 0;">
              A mensagem já estará preenchida — é só enviar!
            </p>`
          : `<p style="font-size: 13px; color: #999; font-style: italic;">
              Nenhum número de telefone cadastrado para ${params.memberName}.
            </p>`
      }
      <hr style="margin: 28px 0; border: none; border-top: 1px solid #eee;">
      <p style="font-size: 11px; color: #bbb; margin: 0; text-align: center;">
        Pastoreio — notificação automática de aniversário<br>
        Este e-mail foi enviado ao líder do grupo <em>${params.groupName}</em>.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
