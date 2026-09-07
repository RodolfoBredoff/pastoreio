import { NextResponse } from 'next/server';

// Desativa cache: o healthcheck do Docker precisa sempre receber resposta em tempo real
export const dynamic = 'force-dynamic';

/**
 * Healthcheck para o Docker Compose e CloudFront.
 * Retorna 200 imediatamente se o processo Node/Next.js está de pé.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
