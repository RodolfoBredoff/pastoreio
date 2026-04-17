'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MessageSquare, Phone, Users, Mail, MoreHorizontal, PlusCircle, ClipboardList } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CONTACT_TYPE_CONFIG = {
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'text-green-600' },
  ligacao: { label: 'Ligação', icon: Phone, color: 'text-blue-600' },
  presencial: { label: 'Presencial', icon: Users, color: 'text-purple-600' },
  email: { label: 'E-mail', icon: Mail, color: 'text-orange-600' },
  outro: { label: 'Outro', icon: MoreHorizontal, color: 'text-gray-600' },
} as const;

type ContactType = keyof typeof CONTACT_TYPE_CONFIG;

interface ContactLogEntry {
  id: string;
  contact_type: ContactType;
  note: string | null;
  contacted_at: string;
  leader_name: string | null;
}

interface AddContactDialogProps {
  memberId: string;
  memberName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

function AddContactDialog({ memberId, memberName, open, onOpenChange, onSaved }: AddContactDialogProps) {
  const [contactType, setContactType] = useState<ContactType>('whatsapp');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/members/${memberId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_type: contactType, note: note || null }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro ao registrar');
      }
      setNote('');
      setContactType('whatsapp');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao registrar contato');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Contato — {memberName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>
          )}
          <div className="space-y-2">
            <Label>Tipo de contato</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(CONTACT_TYPE_CONFIG) as [ContactType, typeof CONTACT_TYPE_CONFIG[ContactType]][]).map(
                ([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setContactType(type)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-md border text-xs font-medium transition-colors ${
                        contactType === type
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-input hover:bg-accent'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${contactType === type ? 'text-primary' : config.color}`} />
                      {config.label}
                    </button>
                  );
                }
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-note">Observação (opcional)</Label>
            <textarea
              id="contact-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Conversamos sobre a reunião, ele confirmou presença..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={loading}>Cancelar</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ContactLogProps {
  memberId: string;
  memberName: string;
}

export function ContactLog({ memberId, memberName }: ContactLogProps) {
  const [contacts, setContacts] = useState<ContactLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/members/${memberId}/contacts`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Histórico de Contatos
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddDialog(true)}
            className="gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            Registrar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : contacts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum contato registrado ainda.</p>
            <p className="text-xs mt-1">Registre ligações, mensagens e visitas para acompanhar o pastoreio.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => {
              const config = CONTACT_TYPE_CONFIG[contact.contact_type] ?? CONTACT_TYPE_CONFIG.outro;
              const Icon = config.icon;
              return (
                <div key={contact.id} className="flex gap-3 py-2 border-b last:border-0">
                  <div className={`mt-0.5 shrink-0 ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{config.label}</span>
                      {contact.leader_name && (
                        <span className="text-xs text-muted-foreground">por {contact.leader_name}</span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(contact.contacted_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                    {contact.note && (
                      <p className="text-sm text-muted-foreground mt-0.5 break-words">{contact.note}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AddContactDialog
        memberId={memberId}
        memberName={memberName}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSaved={fetchContacts}
      />
    </Card>
  );
}
