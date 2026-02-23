import { NextResponse } from 'next/server';
import { createMagicLinkToken } from '@/lib/auth/magic-link';
import { getAppBaseUrlForBrowser } from '@/lib/utils';
import { queryOne } from '@/lib/db/postgres';
import { getSession } from '@/lib/auth/session';

/**
 * POST /api/auth/magic-link
 * Cria um token de magic link e envia por email
 * Requer login com senha prévio (sessão válida)
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email é obrigatório' },
        { status: 400 }
      );
    }

    // Validar formato de email
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
    const leaderExists = await queryOne<{ id: string; email: string }>(
      `SELECT id, email FROM leaders WHERE id = $1 AND LOWER(email) = LOWER($2)`,
      [session.id, email]
    );

    if (!leaderExists) {
      return NextResponse.json(
        { error: 'E-mail não corresponde à sua sessão atual. Faça login novamente.' },
        { status: 403 }
      );
    }

    // Criar token de magic link
    const token = await createMagicLinkToken(email);

    // TODO: Enviar email com o link
    // Por enquanto, em desenvolvimento, retornamos o token
    // Em produção, isso deve ser enviado por email
    const baseUrl = getAppBaseUrlForBrowser(request);
    const magicLink = `${baseUrl}/api/auth/verify?token=${token}`;

    if (process.env.NODE_ENV === 'development') {
      console.log('🔗 Magic Link (DEV):', magicLink);
    }

    // Em produção, aqui você enviaria o email
    // await sendEmail({
    //   to: email,
    //   subject: 'Link de acesso - Pequenos Grupos',
    //   html: `Clique no link para fazer login: <a href="${magicLink}">${magicLink}</a>`
    // });

    return NextResponse.json({
      success: true,
      message: 'Link de acesso enviado por email',
      // Retorna o link na resposta até implementar envio por email
      magicLink,
    });
  } catch (error) {
    console.error('Erro ao criar magic link:', error);
    return NextResponse.json(
      { error: 'Erro ao processar solicitação', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
