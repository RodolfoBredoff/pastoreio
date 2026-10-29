import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import baseTailwindConfig from '../../tailwind.config';

/**
 * Build estático da página pública de lista de presença.
 * Saída: apps/lista-presenca-static/dist → enviada ao S3 em lista-presenca-app/
 * (via aws/terraform-lista-presenca). Ver docs/DESIGN_LISTA_PRESENCA_OFFLINE.md.
 *
 *   npm run build:lista-presenca
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

export default defineConfig({
  root: here,
  base: '/lista-presenca-app/',
  plugins: [react()],
  resolve: {
    alias: { '@': repoRoot },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          ...baseTailwindConfig,
          // Só as classes usadas por esta página (CSS menor que o do app inteiro)
          content: [
            path.join(here, 'index.html'),
            path.join(here, 'src/**/*.{ts,tsx}'),
            path.join(repoRoot, 'components/lista-presenca/**/*.{ts,tsx}'),
            path.join(repoRoot, 'components/ui/{button,input,label,checkbox}.tsx'),
          ],
        }),
        autoprefixer(),
      ],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
