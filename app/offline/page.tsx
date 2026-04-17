'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Home, Users, Calendar, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = async () => {
    setChecking(true);
    try {
      await fetch('/api/health', { cache: 'no-store' });
      window.location.href = '/dashboard';
    } catch {
      setChecking(false);
    }
  };

  const quickLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/pessoas', label: 'Pessoas', icon: Users },
    { href: '/chamada', label: 'Chamada', icon: ClipboardCheck },
    { href: '/agenda', label: 'Agenda', icon: Calendar },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-muted p-6">
            <WifiOff className="h-12 w-12 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">Sem conexão</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              O servidor não está acessível no momento. Se o aplicativo estiver instalado e você já o
              acessou antes, as páginas em cache ainda funcionam normalmente.
            </p>
          </div>
        </div>

        {isOnline && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Sua conexão com a internet foi restaurada. Você pode tentar acessar o app novamente.
          </div>
        )}

        <Button onClick={handleRetry} disabled={checking} className="w-full">
          <RefreshCw className={`mr-2 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Verificando...' : 'Tentar reconectar'}
        </Button>

        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-semibold">
              Acesso rápido (cache)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {quickLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm
                             text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Estas páginas podem estar disponíveis em cache do seu dispositivo.
            </p>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          O aplicativo salva dados localmente para uso offline. Presenças registradas sem conexão
          serão sincronizadas automaticamente ao reconectar.
        </p>
      </div>
    </div>
  );
}
