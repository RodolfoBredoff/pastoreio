'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Save, WifiOff, UserPlus, UserCheck, Clock } from 'lucide-react';

interface Member {
  id: string;
  full_name: string;
}

interface Attendance {
  member_id: string;
  is_present: boolean;
}

export interface GuestItem {
  id?: string;
  full_name: string;
  phone?: string | null;
}

interface GuestSuggestion {
  id: string;
  full_name: string;
  phone: string | null;
  appearances: string;
  last_appearance: string;
}

interface PresenceChecklistProps {
  meetingId: string;
  members: Member[];
  attendance: Attendance[];
  guests?: GuestItem[];
  onSaved?: () => void;
  onConvertToMember?: () => void;
}

export function PresenceChecklist({
  meetingId,
  members,
  attendance,
  guests: initialGuests = [],
  onSaved,
  onConvertToMember,
}: PresenceChecklistProps) {
  const { isOnline, addToPendingSync } = useOfflineSync();
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>(
    attendance.reduce((acc, att) => {
      acc[att.member_id] = att.is_present;
      return acc;
    }, {} as Record<string, boolean>)
  );
  const [guests, setGuests] = useState<GuestItem[]>(initialGuests);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GuestSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    setGuests(initialGuests);
  }, [initialGuests]);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/guests/suggestions?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Erro ao buscar sugestões:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (guestName) {
        void fetchSuggestions(guestName);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [guestName, fetchSuggestions]);

  const selectSuggestion = (suggestion: GuestSuggestion) => {
    setGuestName(suggestion.full_name);
    setGuestPhone(suggestion.phone || '');
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const togglePresence = (memberId: string) => {
    setPresenceMap((prev) => ({ ...prev, [memberId]: !prev[memberId] }));
  };

  const addGuest = () => {
    const name = guestName.trim();
    if (!name) return;
    setGuests((prev) => [...prev, { full_name: name, phone: guestPhone.trim() || null }]);
    setGuestName('');
    setGuestPhone('');
  };

  const removeGuest = (index: number) => {
    setGuests((prev) => prev.filter((_, i) => i !== index));
  };

  const convertToMember = async (guestId: string) => {
    setConvertingId(guestId);
    try {
      const res = await fetch(`/api/guests/${guestId}/convert`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao converter');
      }
      setGuests((prev) => prev.filter((g) => g.id !== guestId));
      onConvertToMember?.();
      alert('Visitante convertido em membro com sucesso!');
    } catch (e: unknown) {
      alert('Erro: ' + (e instanceof Error ? e.message : 'Erro ao converter'));
    } finally {
      setConvertingId(null);
    }
  };

  const saveAttendance = async () => {
    setSaving(true);

    try {
      const attendanceData = members.map((member) => ({
        member_id: member.id,
        is_present: presenceMap[member.id] ?? false,
      }));
      const guestsPayload = guests.map((g) => ({
        full_name: g.full_name,
        phone: g.phone ?? null,
      }));

      if (isOnline) {
        const response = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meeting_id: meetingId,
            attendance: attendanceData,
            guests: guestsPayload,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Erro ao salvar presença');
        }

        alert('Presença salva com sucesso!');
        onSaved?.();
      } else {
        for (const item of attendanceData) {
          await addToPendingSync('attendance', 'create', {
            meeting_id: meetingId,
            ...item,
          });
        }
        alert('Presença salva localmente! Será sincronizada quando a conexão voltar.');
      }
    } catch (error: unknown) {
      console.error('Error saving attendance:', error);
      alert('Erro ao salvar presença: ' + (error instanceof Error ? error.message : 'Erro'));
    } finally {
      setSaving(false);
    }
  };

  const presentCount =
    Object.values(presenceMap).filter(Boolean).length + guests.length;
  const absentCount = members.length - Object.values(presenceMap).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{presentCount}</p>
          <p className="text-sm text-muted-foreground">Presentes</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{absentCount}</p>
          <p className="text-sm text-muted-foreground">Ausentes</p>
        </Card>
      </div>

      <div className="space-y-2">
        {members.map((member) => (
          <Card
            key={member.id}
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-accent transition-colors"
            onClick={() => togglePresence(member.id)}
          >
            <span className="font-medium">{member.full_name}</span>
            <Checkbox
              checked={presenceMap[member.id] ?? false}
              onCheckedChange={() => togglePresence(member.id)}
              onClick={(e) => e.stopPropagation()}
            />
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Visitante não cadastrado
        </p>
        <div className="relative">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="Nome"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addGuest()}
                onFocus={() => guestName.length >= 2 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-accent transition-colors border-b last:border-0"
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      <p className="font-medium text-sm">{suggestion.full_name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {suggestion.phone && <span>{suggestion.phone}</span>}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {parseInt(suggestion.appearances)} aparições
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Input
              placeholder="Telefone (opcional)"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGuest()}
              className="flex-1"
            />
            <Button type="button" variant="secondary" onClick={addGuest} disabled={!guestName.trim()}>
              Adicionar
            </Button>
          </div>
          {loadingSuggestions && guestName.length >= 2 && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Buscando visitantes anteriores...
            </p>
          )}
        </div>
        {guests.length > 0 && (
          <ul className="space-y-2 mt-2">
            {guests.map((g, i) => (
              <li
                key={g.id ?? `new-${i}`}
                className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0"
              >
                <span className="text-sm">
                  {g.full_name}
                  {g.phone ? (
                    <span className="text-muted-foreground ml-1">— {g.phone}</span>
                  ) : null}
                </span>
                <div className="flex items-center gap-1">
                  {g.id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => convertToMember(g.id!)}
                      disabled={convertingId === g.id}
                      title="Converter em membro"
                    >
                      {convertingId === g.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserCheck className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGuest(i)}
                    className="text-destructive hover:text-destructive"
                  >
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Button 
        onClick={saveAttendance} 
        disabled={saving} 
        className="w-full"
        size="lg"
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Salvando...
          </>
        ) : (
          <>
            {!isOnline && <WifiOff className="mr-2 h-4 w-4" />}
            <Save className="mr-2 h-4 w-4" />
            {isOnline ? 'Salvar Presença' : 'Salvar Offline'}
          </>
        )}
      </Button>
      {!isOnline && (
        <p className="text-sm text-yellow-600 text-center">
          Modo offline ativo. Os dados serão sincronizados quando a conexão voltar.
        </p>
      )}
    </div>
  );
}
