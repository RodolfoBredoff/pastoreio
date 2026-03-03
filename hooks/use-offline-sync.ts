'use client';

import { useEffect, useState, useCallback } from 'react';
import { db, PendingSync, OfflineMember, OfflineMeeting, OfflineAttendance } from '@/lib/offline-db';

export function useOfflineSync(groupId?: string) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Monitorar status de conexão
  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  // Contar itens pendentes
  const updatePendingCount = useCallback(async () => {
    try {
      const count = await db.pendingSync.count();
      setPendingCount(count);
    } catch (error) {
      console.error('Error counting pending sync:', error);
    }
  }, []);

  useEffect(() => {
    updatePendingCount();
  }, [updatePendingCount]);

  // Baixar dados do servidor (Next.js API) para cache local
  const downloadServerData = useCallback(async () => {
    try {
      const res = await fetch('/api/sync');
      if (!res.ok) return;
      const data = await res.json();

      if (data.members && Array.isArray(data.members)) {
        const items: OfflineMember[] = data.members.map((m: Record<string, unknown>) => ({
          id: m.id as string,
          group_id: m.group_id as string,
          full_name: m.full_name as string,
          phone: m.phone as string,
          birth_date: (m.birth_date ?? '') as string,
          member_type: (m.member_type ?? 'participant') as 'participant' | 'visitor',
          is_active: (m.is_active ?? true) as boolean,
          synced: true,
          updated_at: (m.updated_at ?? new Date().toISOString()) as string,
        }));
        await db.members.bulkPut(items);
      }

      if (data.meetings && Array.isArray(data.meetings)) {
        const items: OfflineMeeting[] = data.meetings.map((m: Record<string, unknown>) => ({
          id: m.id as string,
          group_id: m.group_id as string,
          meeting_date: m.meeting_date as string,
          is_cancelled: (m.is_cancelled ?? false) as boolean,
          synced: true,
        }));
        await db.meetings.bulkPut(items);
      }

      if (data.attendance && Array.isArray(data.attendance)) {
        const items: OfflineAttendance[] = data.attendance.map((a: Record<string, unknown>) => ({
          id: a.id as string,
          meeting_id: a.meeting_id as string,
          member_id: a.member_id as string,
          is_present: (a.is_present ?? false) as boolean,
          synced: true,
          created_at: (a.created_at ?? new Date().toISOString()) as string,
        }));
        await db.attendance.bulkPut(items);
      }
    } catch (error) {
      console.error('Error downloading server data:', error);
    }
  }, []);

  // Sincronizar dados pendentes com a API Next.js
  const syncData = useCallback(async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);

    try {
      const pending = await db.pendingSync.toArray();

      if (pending.length === 0) {
        if (groupId) await downloadServerData();
        setLastSyncTime(new Date());
        return;
      }

      // Agrupar itens de attendance por meeting_id para um POST por reunião
      const attendanceByMeeting = new Map<string, { member_id: string; is_present: boolean }[]>();
      const attendanceIdsByMeeting = new Map<string, number[]>();

      for (const item of pending) {
        if (item.type !== 'attendance' || (item.action !== 'create' && item.action !== 'update')) continue;
        const d = item.data as { meeting_id?: string; member_id?: string; is_present?: boolean };
        if (!d?.meeting_id || d.member_id === undefined) continue;
        const arr = attendanceByMeeting.get(d.meeting_id) ?? [];
        arr.push({ member_id: d.member_id, is_present: d.is_present ?? false });
        attendanceByMeeting.set(d.meeting_id, arr);
        const ids = attendanceIdsByMeeting.get(d.meeting_id) ?? [];
        if (item.id != null) ids.push(item.id);
        attendanceIdsByMeeting.set(d.meeting_id, ids);
      }

      for (const [meetingId, attendance] of attendanceByMeeting) {
        try {
          const res = await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meeting_id: meetingId, attendance }),
          });
          if (res.ok) {
            const idsToDelete = attendanceIdsByMeeting.get(meetingId) ?? [];
            for (const id of idsToDelete) {
              await db.pendingSync.delete(id);
            }
          }
        } catch (err) {
          console.error('Error syncing attendance:', err);
        }
      }

      // Processar member e meeting (create/update) um a um
      for (const item of pending) {
        if (item.type === 'attendance') continue;
        try {
          if (item.type === 'member') {
            const d = item.data as Record<string, unknown>;
            if (item.action === 'create') {
              const res = await fetch('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  full_name: d.full_name,
                  phone: d.phone,
                  birth_date: d.birth_date ?? null,
                  member_type: d.member_type ?? 'participant',
                }),
              });
              if (res.ok && item.id != null) await db.pendingSync.delete(item.id);
            } else if (item.action === 'update' && d.id) {
              const res = await fetch(`/api/members/${d.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  full_name: d.full_name,
                  phone: d.phone,
                  birth_date: d.birth_date,
                  member_type: d.member_type,
                  is_active: d.is_active,
                }),
              });
              if (res.ok && item.id != null) await db.pendingSync.delete(item.id);
            }
          } else if (item.type === 'meeting') {
            const d = item.data as Record<string, unknown>;
            if (item.action === 'create') {
              const res = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  meeting_date: d.meeting_date,
                  meeting_time: d.meeting_time,
                  title: d.title,
                  notes: d.notes,
                  meeting_type: d.meeting_type ?? 'regular',
                }),
              });
              if (res.ok && item.id != null) await db.pendingSync.delete(item.id);
            } else if (item.action === 'update' && d.id) {
              const res = await fetch(`/api/meetings/${d.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  meeting_date: d.meeting_date,
                  meeting_time: d.meeting_time,
                  title: d.title,
                  notes: d.notes,
                  meeting_type: d.meeting_type,
                  is_cancelled: d.is_cancelled,
                }),
              });
              if (res.ok && item.id != null) await db.pendingSync.delete(item.id);
            }
          }
        } catch (err) {
          console.error(`Error syncing ${item.type}:`, err);
        }
      }

      await updatePendingCount();
      setLastSyncTime(new Date());

      if (groupId) {
        await downloadServerData();
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, groupId, updatePendingCount, downloadServerData]);

  // Sincronizar automaticamente quando voltar online
  useEffect(() => {
    if (isOnline) {
      syncData();
    }
  }, [isOnline]);

  // Adicionar item à fila de sync
  const addToPendingSync = async (
    type: PendingSync['type'],
    action: PendingSync['action'],
    data: Record<string, unknown>
  ) => {
    try {
      await db.pendingSync.add({
        type,
        action,
        data,
        timestamp: new Date().toISOString(),
      });
      await updatePendingCount();
    } catch (error) {
      console.error('Error adding to pending sync:', error);
    }
  };

  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncTime,
    syncData,
    addToPendingSync,
    downloadServerData,
  };
}
