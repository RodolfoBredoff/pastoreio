import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import { PublicAttendanceView } from '@/components/lista-presenca/public-attendance-view';
import { staticAttendanceSource } from '@/components/lista-presenca/attendance-sources';

const SLUG_RE = /^[a-z0-9-]{1,120}$/i;

/**
 * Aceita /lista-presenca/<slug>, /lista-presenca-app/<slug> ou ?slug=<slug>.
 * Só slugs/tokens válidos são usados para montar a URL do snapshot.
 */
function readSlug(): string | undefined {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const last = parts.length >= 2 ? decodeURIComponent(parts[parts.length - 1]) : '';
  const candidate =
    last && !last.includes('.') ? last : new URLSearchParams(window.location.search).get('slug') ?? '';
  return SLUG_RE.test(candidate) ? candidate.toLowerCase() : undefined;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PublicAttendanceView slug={readSlug()} source={staticAttendanceSource} />
  </StrictMode>
);
