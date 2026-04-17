/**
 * Módulo de envio de mensagens WhatsApp via Meta Business Cloud API.
 *
 * Pré-requisitos (configurar no AWS SSM Parameter Store e/.env.local):
 *   - WHATSAPP_ACCESS_TOKEN      Token permanente gerado no Meta for Developers
 *   - WHATSAPP_PHONE_NUMBER_ID   ID do número de telefone Business registrado
 *   - WHATSAPP_TEMPLATE_NAME     Nome do template aprovado (default: aniversario_lider)
 *
 * Se as variáveis não estiverem configuradas, o módulo loga um aviso e retorna false
 * sem interromper o fluxo do cron.
 *
 * Template sugerido a registrar em developers.facebook.com > WhatsApp > Message Templates:
 *   Nome:      aniversario_lider
 *   Categoria: Utility
 *   Idioma:    Português (BR)
 *   Corpo:     "Olá {{1}}! Hoje é aniversário de {{2}} no grupo {{3}}. Não esqueça de parabenizá-lo(a)! 🎂"
 */

const META_API_VERSION = 'v21.0';
const META_API_BASE = 'https://graph.facebook.com';

interface TemplateMessageParams {
  /** Telefone do destinatário (com ou sem código de país 55). */
  toPhone: string;
  /** Nome do template aprovado na Meta (ex: aniversario_lider). */
  templateName: string;
  /** Variáveis do template na ordem {{1}}, {{2}}, ... */
  variables: string[];
}

/**
 * Normaliza o número de telefone para o formato E.164 sem o '+'.
 * Remove caracteres não numéricos e adiciona o prefixo 55 se necessário.
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/**
 * Envia uma mensagem WhatsApp usando um template pré-aprovado pela Meta.
 * Retorna true em sucesso, false em caso de credenciais ausentes ou erro de API.
 */
export async function sendWhatsAppTemplateMessage(
  params: TemplateMessageParams
): Promise<boolean> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    console.warn(
      '[WhatsApp] WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurados. ' +
        'Mensagem WhatsApp não enviada para o líder.'
    );
    return false;
  }

  const toNumber = normalizePhone(params.toPhone);

  const body = {
    messaging_product: 'whatsapp',
    to: toNumber,
    type: 'template',
    template: {
      name: params.templateName,
      language: {
        code: 'pt_BR',
      },
      components: [
        {
          type: 'body',
          parameters: params.variables.map((value) => ({
            type: 'text',
            text: value,
          })),
        },
      ],
    },
  };

  try {
    const url = `${META_API_BASE}/${META_API_VERSION}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[WhatsApp] Erro ao enviar mensagem para ${toNumber}. Status: ${response.status}. Resposta: ${errorText}`
      );
      return false;
    }

    console.log(`[WhatsApp] Mensagem enviada com sucesso para ${toNumber} (template: ${params.templateName})`);
    return true;
  } catch (error) {
    console.error('[WhatsApp] Erro inesperado ao chamar a Meta Cloud API:', error);
    return false;
  }
}
