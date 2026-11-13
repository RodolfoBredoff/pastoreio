'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Save, WifiOff, UserPlus, UserCheck, Clock, Camera, Trash2, Undo2 } from 'lucide-react';
import { createThumbnailDataUrl } from '@/lib/image-thumbnail';

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
  description?: string | null;
  /** Já existe miniatura salva no servidor */
  has_photo?: boolean;
  /** Miniatura escolhida agora (data URL), ainda não enviada */
  photo_data_url?: string | null;
}

interface GuestSuggestion {
  id: string;
  full_name: string;
  phone: string | null;
  description?: string | null;
  has_photo?: boolean;
  appearances: string;
  last_appearance: string;
}

interface RecurringGuest {
  id: string;
  full_name: string;
  appearances: number;
}

interface PresenceChecklistProps {
  meetingId: string;
  /** Texto "Título — dd/mm/aaaa" usado na confirmação de encontro futuro */
  meetingLabel?: string;
  /** Encontro que ainda não aconteceu: pede confirmação antes de salvar */
  isFutureMeeting?: boolean;
  members: Member[];
  attendance: Attendance[];
  guests?: GuestItem[];
  onSaved?: () => void;
  onConvertToMember?: () => void;
}

export function PresenceChecklist({
  meetingId,
  meetingLabel,
  isFutureMeeting = false,
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
  const [guestDescription, setGuestDescription] = useState('');
  const [recurring, setRecurring] = useState<RecurringGuest[]>([]);
  // Foto do visitante que está sendo cadastrado agora (opcional)
  const [guestPhoto, setGuestPhoto] = useState<string | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoVersion, setPhotoVersion] = useState(0);
  // Última conversão feita nesta tela: permite desfazer na hora
  const [lastConversion, setLastConversion] = useState<{ memberId: string; name: string } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GuestSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    setGuests(initialGuests);
  }, [initialGuests]);

  useEffect(() => {
    setPresenceMap(
      attendance.reduce((acc, att) => {
        acc[att.member_id] = att.is_present;
        return acc;
      }, {} as Record<string, boolean>)
    );
  }, [attendance]);

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
    setGuestDescription(suggestion.description || '');
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const togglePresence = (memberId: string) => {
    setPresenceMap((prev) => ({ ...prev, [memberId]: !prev[memberId] }));
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError('');
    setPhotoBusy(true);
    try {
      setGuestPhoto(await createThumbnailDataUrl(file));
      setPhotoConsent(false);
    } catch (e) {
      setGuestPhoto(null);
      setPhotoError(e instanceof Error ? e.message : 'Não foi possível usar essa foto');
    } finally {
      setPhotoBusy(false);
    }
  };

  const clearPendingPhoto = () => {
    setGuestPhoto(null);
    setPhotoConsent(false);
    setPhotoError('');
  };

  /** Foto de visitante que já está registrado: envia na hora (com confirmação de consentimento). */
  const replaceGuestPhoto = async (guestId: string, file: File | undefined) => {
    if (!file) return;
    setPhotoError('');
    setPhotoBusy(true);
    try {
      const thumb = await createThumbnailDataUrl(file);
      if (!window.confirm('O visitante autorizou o registro da foto?')) return;
      const res = await fetch(`/api/guests/${guestId}/photo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo: thumb, consent: true }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Erro ao salvar a foto');
      setGuests((prev) => prev.map((g) => (g.id === guestId ? { ...g, has_photo: true } : g)));
      setPhotoVersion((v) => v + 1);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Erro ao salvar a foto');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removeGuestPhoto = async (guestId: string) => {
    if (!window.confirm('Remover a foto deste visitante?')) return;
    setPhotoError('');
    try {
      const res = await fetch(`/api/guests/${guestId}/photo`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao remover a foto');
      setGuests((prev) => prev.map((g) => (g.id === guestId ? { ...g, has_photo: false } : g)));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Erro ao remover a foto');
    }
  };

  const addGuest = () => {
    const name = guestName.trim();
    if (!name) return;
    // Foto só entra com consentimento marcado
    if (guestPhoto && !photoConsent) return;
    setGuests((prev) => [
      ...prev,
      {
        full_name: name,
        phone: guestPhone.trim() || null,
        description: guestDescription.trim() || null,
        photo_data_url: guestPhoto,
      },
    ]);
    clearPendingPhoto();
    setGuestName('');
    setGuestPhone('');
    setGuestDescription('');
  };

  const removeGuest = (index: number) => {
    setGuests((prev) => prev.filter((_, i) => i !== index));
  };

  const convertToMember = async (guestId: string) => {
    setConvertingId(guestId);
    try {
      const res = await fetch(`/api/guests/${guestId}/convert`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { id?: string; full_name?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao converter');
      }
      const converted = guests.find((g) => g.id === guestId);
      setGuests((prev) => prev.filter((g) => g.id !== guestId));
      setRecurring((prev) => prev.filter((g) => g.id !== guestId));
      if (data.id) setLastConversion({ memberId: data.id, name: data.full_name ?? converted?.full_name ?? 'Visitante' });
      onConvertToMember?.();
    } catch (e: unknown) {
      alert('Erro: ' + (e instanceof Error ? e.message : 'Erro ao converter'));
    } finally {
      setConvertingId(null);
    }
  };

  const undoLastConversion = async () => {
    if (!lastConversion) return;
    setUndoing(true);
    try {
      const res = await fetch(`/api/members/${lastConversion.memberId}/undo-conversion`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; reasons?: string[] };
      if (!res.ok) throw new Error([data.error, ...(data.reasons ?? [])].filter(Boolean).join(' '));
      setLastConversion(null);
      onConvertToMember?.();
      onSaved?.();
    } catch (e: unknown) {
      alert('Erro: ' + (e instanceof Error ? e.message : 'Erro ao desfazer'));
    } finally {
      setUndoing(false);
    }
  };

  const saveAttendance = async () => {
    if (
      isFutureMeeting &&
      !window.confirm(
        `Este encontro ainda não aconteceu${meetingLabel ? ` (${meetingLabel})` : ''}.\n\nSalvar a chamada mesmo assim?`
      )
    ) {
      return;
    }
    setSaving(true);

    try {
      const attendanceData = members.map((member) => ({
        member_id: member.id,
        is_present: presenceMap[member.id] ?? false,
      }));
      const guestsPayload = guests.map((g) => ({
        full_name: g.full_name,
        phone: g.phone ?? null,
        description: g.description ?? null,
        // Foto só vai quando foi escolhida agora; sem isso o servidor mantém a foto existente
        ...(g.photo_data_url ? { photo: g.photo_data_url, photo_consent: true } : {}),
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

        const saved = (await response.json().catch(() => ({}))) as {
          recurring_guests?: RecurringGuest[];
        };
        setRecurring(Array.isArray(saved.recurring_guests) ? saved.recurring_guests : []);

        alert('Presença salva com sucesso!');
        onSaved?.();
      } else {
        for (const item of attendanceData) {
          await addToPendingSync('attendance', 'create', {
            meeting_id: meetingId,
            ...item,
          });
        }
        alert(
          'Presença salva localmente! Será sincronizada quando a conexão voltar.' +
            (guests.length > 0
              ? '\n\nAtenção: visitantes não cadastrados não são salvos offline. Registre-os quando estiver online.'
              : '')
        );
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
                      className="w-full px-3 py-2 text-left hover:bg-accent transition-colors border-b last:border-0 flex items-center gap-3"
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      {suggestion.has_photo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/guests/${suggestion.id}/photo`}
                          alt=""
                          className="h-9 w-9 rounded-md object-cover border shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                      <p className="font-medium text-sm">{suggestion.full_name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {suggestion.phone && <span>{suggestion.phone}</span>}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {parseInt(suggestion.appearances)} aparições
                        </span>
                      </div>
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
            <Button type="button" variant="secondary" onClick={addGuest} disabled={!guestName.trim() || (Boolean(guestPhoto) && !photoConsent)}>
              Adicionar
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {guestPhoto ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={guestPhoto} alt="Foto do visitante" className="h-14 w-14 rounded-md object-cover border" />
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={photoConsent}
                    onChange={(e) => setPhotoConsent(e.target.checked)}
                    aria-label="Consentimento da foto"
                  />
                  O visitante autorizou o registro da foto
                </label>
                <Button type="button" variant="ghost" size="sm" onClick={clearPendingPhoto}>
                  Remover foto
                </Button>
              </>
            ) : (
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Camera className="h-4 w-4" />
                {photoBusy ? 'Preparando foto...' : 'Adicionar foto (opcional)'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Foto do visitante"
                  disabled={photoBusy}
                  onChange={(e) => {
                    void pickPhoto(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            {guestPhoto && !photoConsent && (
              <p className="text-xs text-amber-700 w-full">Marque a autorização para poder adicionar o visitante com foto.</p>
            )}
          </div>
          {photoError && <p className="text-xs text-destructive mt-1">{photoError}</p>}
          <Input
            className="mt-2"
            placeholder="Descrição para reconhecer (opcional). Ex.: camisa azul, veio com a Maria"
            maxLength={200}
            value={guestDescription}
            onChange={(e) => setGuestDescription(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addGuest()}
            aria-label="Descrição do visitante"
          />
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
                {(g.photo_data_url || (g.has_photo && g.id)) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.photo_data_url ?? `/api/guests/${g.id}/photo?v=${photoVersion}`}
                    alt={`Foto de ${g.full_name}`}
                    className="h-10 w-10 rounded-md object-cover border shrink-0"
                  />
                )}
                <span className="text-sm flex-1">
                  {g.full_name}
                  {g.phone ? (
                    <span className="text-muted-foreground ml-1">— {g.phone}</span>
                  ) : null}
                  {g.description ? (
                    <span className="block text-xs text-muted-foreground">{g.description}</span>
                  ) : null}
                </span>
                <div className="flex items-center gap-1">
                  {g.id ? (
                    <label
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent cursor-pointer"
                      title={g.has_photo ? 'Trocar foto' : 'Adicionar foto'}
                    >
                      <Camera className="h-4 w-4" />
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        aria-label={`Foto de ${g.full_name}`}
                        disabled={photoBusy}
                        onChange={(e) => {
                          void replaceGuestPhoto(g.id!, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  ) : null}
                  {g.id && g.has_photo ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeGuestPhoto(g.id!)}
                      title="Remover foto"
                      aria-label={`Remover foto de ${g.full_name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
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

      {lastConversion && (
        <Card className="p-3 flex flex-wrap items-center justify-between gap-2 border-green-300 bg-green-50" data-testid="conversion-banner">
          <p className="text-sm text-green-900">{lastConversion.name} agora é membro do grupo.</p>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={undoLastConversion} disabled={undoing}>
              {undoing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Undo2 className="mr-1 h-4 w-4" />Desfazer</>}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLastConversion(null)}>
              Ok
            </Button>
          </div>
        </Card>
      )}

      {recurring.length > 0 && (
        <Card className="p-4 space-y-2 border-blue-300 bg-blue-50" data-testid="recurring-guests">
          <p className="text-sm font-medium text-blue-900">
            Visitantes que já vieram mais de uma vez. Quer cadastrá-los como membros?
          </p>
          <ul className="space-y-2">
            {recurring.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {r.full_name}
                  <span className="text-muted-foreground"> — {r.appearances} encontros</span>
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => convertToMember(r.id)}
                    disabled={convertingId === r.id}
                  >
                    {convertingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cadastrar como membro'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setRecurring((prev) => prev.filter((x) => x.id !== r.id))}
                  >
                    Agora não
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
