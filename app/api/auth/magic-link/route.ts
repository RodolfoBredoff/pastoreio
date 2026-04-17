import { NextResponse } from 'next/server';
import { createMagicLinkToken } from '@/lib/auth/magic-link';
import { getAppBaseUrlForBrowser } from '@/lib/utils';
import { queryOne } from '@/lib/db/postgres';
import { getSession } from '@/lib/auth/session';
import { sendEmail, buildMagicLinkEmailHtml } from '@/lib/email/sender';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const MAGIC_LINK_EXPIRES_MINUTES = 15;

/**
 * POST /api/auth/magic-link
 * Cria um token de magic link e envia por e-mail via SES.
 * Requer login com senha prévio (sessão válida).
 * Rate limit: 5 requisições por IP a cada 15 minutos.
 */
export async function POST(request: Request) {
  try {
    // Rate limit por IP: 5 tentativas por 15 min
    const ip = getClientIp(request);
    const rl = rateLimit(`magic:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSec) },
        }
      );
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email é obrigatório' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      );
    }

    // Verificar se há uma sessão válida no dispositivo
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'É necessário fazer login com senha primeiro para gerar o link de acesso.' },
        { status: 401 }
      );
    }

    // Verificar se o e-mail da sessão corresponde ao e-mail solicitado
    const leader = await queryOne<{ id: string; email: string; full_name: string }>(
      `SELECT id, email, full_name FROM leaders WHERE id = $1 AND LOWER(email) = LOWER($2)`,
      [session.id, email]
    );

    if (!leader) {
      return NextResponse.json(
        { error: 'E-mail não corresponde à sua sessão atual. Faça login novamente.' },
        { status: 403 }
      );
    }

    // Criar token de magic link
    const token = await createMagicLinkToken(email);
    const baseUrl = getAppBaseUrlForBrowser(request);
    const magicLink = `${baseUrl}/api/auth/verify?token=${token}`;

    // Enviar e-mail via SES
    const html = buildMagicLinkEmailHtml({
      leaderName: leader.full_name,
      magicLink,
      expiresInMinutes: MAGIC_LINK_EXPIRES_MINUTES,
    });

    const emailSent = await sendEmail({
      to: email,
      subject: '🔑 Seu link de acesso — Pequenos Grupos',
      html,
      text: `Olá ${leader.full_name}! Acesse o sistema pelo link: ${magicLink}\n\nO link expira em ${MAGIC_LINK_EXPIRES_MINUTES} minutos e pode ser usado apenas uma vez.`,
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('🔗 Magic Link (DEV):', magicLink);
    }

    if (!emailSent && process.env.NODE_ENV === 'development') {
      // Em desenvolvimento sem SES, retorna o link para facilitar o teste
      return NextResponse.json({
        success: true,
        message: 'Link de acesso gerado (SES não configurado — modo desenvolvimento)',
        magicLink,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Link de acesso enviado para o seu e-mail. Verifique sua caixa de entrada.',
    });
  } catch (error) {
    console.error('Erro ao criar magic link:', error);
    return NextResponse.json(
      { error: 'Erro ao processar solicitação' },
      { status: 500 }
    );
  }
}
