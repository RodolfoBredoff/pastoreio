import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { RegisterServiceWorker } from '@/components/pwa/register-service-worker';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Pastoreio',
  description: 'Sistema de gestão de pequenos grupos — Pastoreio.io',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Pastoreio',
  },
};

export const viewport: Viewport = {
  themeColor: '#2D6A4F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/icons/pastoreio.svg" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512x512.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png" />
        {/* iOS usa apple-touch-icon sem sizes como prioridade */}
        <link rel="apple-touch-icon" href="/icons/icon-512x512.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <div suppressHydrationWarning>
          {children}
        </div>
        <InstallPrompt />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
