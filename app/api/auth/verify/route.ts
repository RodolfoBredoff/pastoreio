import { NextResponse } from 'next/server';
import { validateMagicLinkToken } from '@/lib/auth/magic-link';
import { createSessionTokenOnly, SESSION_COOKIE_NAME, SESSION_MAX_AGE, getCookieSecure } from '@/lib/auth/session';
import { getAppBaseUrlForBrowser } from '@/lib/utils';

/**
 * GET /api/auth/verify?token=...
 * Valida o token de magic link, cria a sessão no banco e redireciona com o cookie setado na resposta.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token não fornecido' },
        { status: 400 }
      );
    }

    const userData = await validateMagicLinkToken(token);

    if (!userData) {
      return NextResponse.json(
        { error: 'Token inválido ou expirado' },
        { status: 400 }
      );
    }

    const sessionToken = await createSessionTokenOnly(userData.userId, userData.email);

    const baseUrl = getAppBaseUrlForBrowser(request);
    const redirectUrl = `${baseUrl}/dashboard`;
    const res = NextResponse.redirect(redirectUrl, 302);
    res.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: getCookieSecure(),
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });
    return res;
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    return NextResponse.json(
      { error: 'Erro ao processar autenticação' },
      { status: 500 }
    );
  }
}
