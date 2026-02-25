import { NextResponse, type NextRequest } from 'next/server';
import { getSessionFromCookie, getAdminSessionFromCookie } from './middleware-session';

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Rotas do painel admin ───────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    // A página de login do admin é pública
    if (pathname === '/admin/login') {
      const adminUser = await getAdminSessionFromCookie(request);
      if (adminUser) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin';
        return NextResponse.redirect(url);
      }
      return NextResponse.next({ request });
    }

    // Todas as outras rotas /admin exigem sessão admin
    const adminUser = await getAdminSessionFromCookie(request);
    if (!adminUser) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }

    return NextResponse.next({ request });
  }

  // ─── Rotas normais (líderes) ─────────────────────────────────────────────
  const user = await getSessionFromCookie();

  // Lista de presença por token: rota pública (quem não tem app acessa o link e confirma por email/telefone)
  if (pathname.startsWith('/lista-presenca')) {
    return NextResponse.next({ request });
  }

  // Redirect to login if not authenticated and trying to access protected routes
  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/sw.js') &&
    !pathname.startsWith('/manifest.json')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect to dashboard if authenticated and trying to access login
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next({
    request,
  });
}
