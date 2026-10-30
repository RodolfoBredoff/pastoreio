import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/push/sender';

/**
 * GET /api/notifications/vapid-public-key
 * Chave pública VAPID lida em tempo de execução (a imagem Docker é gerada sem as chaves,
 * então variáveis NEXT_PUBLIC_* ficariam vazias no navegador).
 */
export async function GET() {
  const key = getVapidPublicKey();
  if (!key) return NextResponse.json({ error: 'Notificações não configuradas' }, { status: 503 });
  return NextResponse.json({ key }, { headers: { 'Cache-Control': 'no-store' } });
}
