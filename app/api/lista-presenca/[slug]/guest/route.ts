import { NextResponse } from 'next/server';

/**
 * POST /api/lista-presenca/[slug]/guest
 * Este endpoint existia para cadastro público de visitantes no modelo antigo.
 *
 * Como a lista pública agora é "somente totais" (sem PII), e o modo "open" cobre o caso
 * de autocadastro, o cadastro de visitantes deve ser feito pela rota interna do líder/secretário.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Cadastro público de visitantes não está disponível neste link.' },
    { status: 400 }
  );
}

