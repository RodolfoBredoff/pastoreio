'use client';

import { useState, useEffect } from 'react';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WifiOff, Wifi, RefreshCw, Clock } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/utils';

interface OfflineIndicatorProps {
  groupId?: string;
}

export function OfflineIndicator({ groupId }: OfflineIndicatorProps) {
  const [mounted, setMounted] = useState(false);
  const { isOnline, isSyncing, pendingCount, lastSyncTime, syncData, downloadServerData } = useOfflineSync(groupId);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Quando online e com grupo, manter cache local atualizado (para uso offline posterior)
  useEffect(() => {
    if (mounted && isOnline && groupId) {
      downloadServerData();
    }
  }, [mounted, isOnline, groupId, downloadServerData]);

  if (isOnline && pendingCount === 0) {
    return null; // Não mostrar nada se está online e tudo sincronizado
  }

  const icon = (Icon: React.ComponentType<{ className?: string }>, className: string) =>
    mounted ? <Icon className={className} /> : <span className={className} aria-hidden />;

  return (
    <div className="fixed bottom-20 right-4 z-50 lg:bottom-4">
      <div className="flex flex-col gap-2">
        {/* Status de Conexão */}
        {!isOnline && (
          <Badge variant="destructive" className="flex items-center gap-2 px-3 py-2 shadow-lg">
            {icon(WifiOff, 'h-4 w-4')}
            Modo Offline
          </Badge>
        )}

        {/* Pendências de Sync */}
        {pendingCount > 0 && (
          <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-3 shadow-lg max-w-xs">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {mounted ? (
                  <RefreshCw className={`h-4 w-4 text-yellow-700 ${isSyncing ? 'animate-spin' : ''}`} />
                ) : (
                  <span className="h-4 w-4 inline-block" aria-hidden />
                )}
                <span className="text-sm font-medium text-yellow-900">
                  {isSyncing ? 'Sincronizando...' : `${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`}
                </span>
              </div>
              {isOnline && !isSyncing && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-yellow-900"
                  onClick={syncData}
                >
                  Sincronizar
                </Button>
              )}
            </div>
            {lastSyncTime && (
              <div className="flex items-center gap-1 text-xs text-yellow-700">
                {icon(Clock, 'h-3 w-3')}
                <span>
                  Última sync: {formatDistanceToNow(lastSyncTime)}
                </span>
              </div>
            )}
            {!isOnline && (
              <p className="text-xs text-yellow-700 mt-1">
                Os dados serão sincronizados quando a conexão voltar.
              </p>
            )}
          </div>
        )}

        {/* Online e Sincronizado */}
        {isOnline && pendingCount === 0 && lastSyncTime && (
          <Badge variant="secondary" className="flex items-center gap-2 px-3 py-2 shadow-lg bg-green-100 text-green-800 border-green-300">
            {icon(Wifi, 'h-4 w-4')}
            Sincronizado
          </Badge>
        )}
      </div>
    </div>
  );
}
