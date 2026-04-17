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
