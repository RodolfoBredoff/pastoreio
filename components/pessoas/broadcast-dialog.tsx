'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { getWhatsAppUrl } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

/** Mensagens convidativas para quem está com faltas seguidas (uma escolhida ao acaso ao selecionar Faltantes). */
const MESSAGES_FOR_ABSENT = [
  'Olá, {nome}! Passando para dizer que sentimos sua falta no nosso último encontro. O grupo não é o mesmo sem a sua participação e alegria. Espero que você esteja bem e, se possível, compareça no próximo!',
  '{nome}, estamos sentindo sua falta nos nossos encontros. Saiba que você é importante para nós e está em nossas orações. Se precisar de algo, conte comigo!',
  'Olá, {nome}! Como foi sua semana? Sentimos um vazio no grupo sem você. Lembre-se que você faz parte da nossa família espiritual e sua presença nos edifica muito.',
  'Oi, {nome}! Passando para dizer que você faz falta! O pequeno grupo é um lugar de cuidado mútuo e sua presença é essencial para completar nossa mesa. Um abraço!',
  '{nome}! Sentimos saudade de você no nosso último encontro. Queremos muito caminhar perto de você. Nos dê notícias e tente aparecer no próximo encontro!',
  'Olá, {nome}! Tudo bem por aí? Sentimos sua ausência e passamos para lembrar o quanto você é especial para este grupo. Estamos à disposição para o que precisar!',
  'Oi, {nome}! Sentimos um vazio na nossa mesa sem você. A comunhão cristã é o solo onde nossa fé floresce, e queremos muito continuar crescendo ao seu lado. Nos dê notícias!',
  '{nome}, estamos com saudades e na expectativa de te ver! Nada substitui a comunhão presencial para o nosso fortalecimento mútuo. Que sua semana seja de paz e te esperamos no grupo!',
  'Olá, {nome}! Sentimos falta da sua presença. A Bíblia ensina que crescemos juntos, e sua participação é uma peça essencial para o amadurecimento do nosso grupo. Esperamos você no próximo!',
  'Oi, {nome}! Como você está? Nossa comunhão fica incompleta sem você. O Senhor nos vocacionou para crescermos uns com os outros, e sua vida edifica a nossa. Nos vemos em breve?',
];

/** Mensagens convidativas para visitantes (uma escolhida ao acaso ao selecionar Visitantes). */
const MESSAGES_FOR_VISITOR = [
  'Olá, {nome}! Tudo bem? Gostaria de dizer que, embora ainda não tenhamos nos encontrado pessoalmente, você já é parte da nossa intercessão. O grupo de WhatsApp é apenas a porta; a verdadeira vida acontece quando estamos juntos. Queremos muito te conhecer!',
  'Oi, {nome}! Passo para lembrar que sua vida é um presente que queremos celebrar de perto. O grupo aqui é bom, mas o café e a partilha presencial são onde realmente crescemos. As portas estão abertas para você!',
  'Paz, {nome}! Como tem passado? Sei que a rotina é corrida, mas senti de te dizer que você faz falta em nossa mesa. A comunhão cristã floresce no olhar e no abraço, e sua presença enriqueceria muito nosso grupo. Apareça quando puder!',
  'Olá, {nome}! Passando para deixar um abraço pastoral. Fomos criados para caminhar em família, e o nosso pequeno grupo só é completo com cada membro presente. Gostaríamos muito de ter você conosco no próximo encontro!',
  '{nome}, o WhatsApp nos aproxima, mas a presença nos une. Queria te convidar para experimentar o que Deus tem feito em nosso meio presencialmente. Sua história e sua vida são importantes para nós!',
  'Oi, {nome}! Tudo bem por aí? Temos sentido falta de te ver nos nossos encontros. Mais do que mensagens, desejamos comunhão real e crescimento mútuo. Saiba que há um lugar reservado para você em nossa próxima reunião.',
  'Olá, {nome}! Espero que sua semana esteja sendo abençoada. O grupo digital é um suporte, mas é no encontro face a face que o cuidado mútuo acontece de verdade. Seria uma alegria imensa ter você conosco!',
  'Paz do Senhor, {nome}! Como pastor/líder, quero que saiba que você é lembrado e valorizado. O pequeno grupo é um lugar de descanso e fortalecimento, e sua presença física faz toda a diferença para o corpo. Estamos te esperando!',
  '{nome}, cada pessoa traz uma cor única para o grupo, e sentimos que falta a sua. A vida cristã é mais leve quando caminhamos juntos. Que tal nos dar a alegria da sua companhia no próximo encontro?',
  'Oi, {nome}! Passando para dizer que nossa porta está sempre destrancada para você. Acreditamos que o crescimento real acontece na proximidade. Que tal ter um tempo de comunhão conosco esta semana? Sua presença é essencial!',
];

interface Member {
  id: string;
  full_name: string;
  phone: string;
  member_type: 'participant' | 'visitor';
}

/** Resposta da API /api/members/absent; phone pode ser null. */
interface AbsentMemberItem {
  id: string;
  full_name: string;
  phone: string | null;
  member_type: 'participant' | 'visitor';
  consecutive_absences?: number;
}

interface BroadcastDialogProps {
  members: Member[];
}

export function BroadcastDialog({ members }: BroadcastDialogProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('Olá! Tudo bem?');
  const [filter, setFilter] = useState<'all' | 'participant' | 'visitor' | 'absent'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [absentMembers, setAbsentMembers] = useState<AbsentMemberItem[]>([]);
  const prevFilterRef = useRef<'all' | 'participant' | 'visitor' | 'absent'>('all');

  // Buscar faltantes ao abrir o dialog
  useEffect(() => {
    if (!open) return;
    fetch('/api/members/absent')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AbsentMemberItem[]) => setAbsentMembers(data))
      .catch(() => setAbsentMembers([]));
  }, [open]);

  // Lista base conforme filtro: todos / participantes / visitantes / faltantes
  const baseList: { id: string; full_name: string; phone: string | null; member_type: 'participant' | 'visitor' }[] =
    filter === 'absent'
      ? absentMembers
      : members.filter((m) => {
          if (filter === 'all') return true;
          return m.member_type === filter;
        });

  // Atualizar seleção só ao abrir o dialog ou ao mudar o filtro (sem depender de absentMembers),
  // para não sobrescrever quando o usuário marcar/desmarcar pessoas nos Faltantes.
  useEffect(() => {
    if (!open) return;
    const withPhone =
      filter === 'absent'
        ? absentMembers.filter((m) => m.phone).map((m) => m.id)
        : baseList.filter((m) => m.phone).map((m) => m.id);
    setSelectedIds(new Set(withPhone));
    if (filter === 'absent' && prevFilterRef.current !== 'absent') {
      setMessage(MESSAGES_FOR_ABSENT[Math.floor(Math.random() * MESSAGES_FOR_ABSENT.length)] ?? MESSAGES_FOR_ABSENT[0]);
    }
    if (filter === 'visitor' && prevFilterRef.current !== 'visitor') {
      setMessage(MESSAGES_FOR_VISITOR[Math.floor(Math.random() * MESSAGES_FOR_VISITOR.length)] ?? MESSAGES_FOR_VISITOR[0]);
    }
    prevFilterRef.current = filter;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reagir a open/filter; baseList/absentMembers usados no momento do clique
  }, [open, filter]);

  // Quando estiver em Faltantes e a lista de ausentes acabar de carregar, preencher seleção só se ainda estiver vazia.
  useEffect(() => {
    if (!open || filter !== 'absent' || absentMembers.length === 0) return;
    setSelectedIds((prev) => {
      if (prev.size > 0) return prev;
      const withPhone = absentMembers.filter((m) => m.phone).map((m) => m.id);
      return new Set(withPhone);
    });
  }, [open, filter, absentMembers]);

  const filteredBySearch = baseList.filter((m) =>
    m.full_name.toLowerCase().includes(search.toLowerCase().trim())
  );

  const selectedMembers = filteredBySearch.filter((m) => selectedIds.has(m.id) && m.phone);

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const withPhone = filteredBySearch.filter((m) => m.phone).map((m) => m.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      withPhone.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBroadcast = async () => {
    if (selectedMembers.length === 0) return;
    setSending(true);
    setProgress(0);

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < selectedMembers.length; i++) {
      const member = selectedMembers[i];
      const url = getWhatsAppUrl(member.phone ?? '', member.full_name);
      const customUrl = url.replace(
        encodeURIComponent(`Olá ${member.full_name}! Tudo bem?`),
        encodeURIComponent(message.replace(/{nome}/g, member.full_name))
      );

      window.open(customUrl, '_blank');
      setProgress(Math.round(((i + 1) / selectedMembers.length) * 100));

      if (i < selectedMembers.length - 1) {
        await delay(2000);
      }
    }

    setSending(false);
    setTimeout(() => {
      setOpen(false);
      setProgress(0);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <MessageCircle className="mr-2 h-4 w-4" />
          Mensagem em Grupo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Mensagem via WhatsApp</DialogTitle>
          <DialogDescription>
            Selecione as pessoas que receberão a mensagem. Use {'{nome}'} para personalizar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Filtro rápido */}
          <div className="space-y-2">
            <Label>Filtro rápido:</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                Todos ({members.length})
              </Button>
              <Button
                type="button"
                variant={filter === 'participant' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('participant')}
              >
                Participantes ({members.filter(m => m.member_type === 'participant').length})
              </Button>
              <Button
                type="button"
                variant={filter === 'visitor' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('visitor')}
              >
                Visitantes ({members.filter(m => m.member_type === 'visitor').length})
              </Button>
              <Button
                type="button"
                variant={filter === 'absent' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('absent')}
              >
                Faltantes ({absentMembers.length})
              </Button>
            </div>
          </div>

          {/* Busca */}
          <div className="space-y-1">
            <Label htmlFor="search-members">Buscar por nome</Label>
            <Input
              id="search-members"
              placeholder="Digite o nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Seleção de pessoas */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="basis-full sm:basis-auto">Selecionar pessoas ({selectedMembers.length} com telefone):</Label>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={selectAllFiltered}>
                  Marcar todos
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                  Desmarcar
                </Button>
              </div>
            </div>
            {filter === 'absent' && (
              <p className="text-xs text-muted-foreground">
                Você pode marcar ou desmarcar quem receberá a mensagem. A mensagem abaixo também pode ser editada.
              </p>
            )}
            <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
              {filteredBySearch.map((member) => {
                const hasPhone = !!member.phone;
                return (
                  <label
                    key={member.id}
                    className={`flex items-center gap-3 py-2 px-2 rounded-md cursor-pointer hover:bg-muted/50 ${!hasPhone ? 'opacity-60' : ''}`}
                  >
                    <Checkbox
                      checked={selectedIds.has(member.id)}
                      onCheckedChange={() => hasPhone && toggleOne(member.id)}
                      disabled={!hasPhone}
                    />
                    <span className="text-sm flex-1 truncate">{member.full_name}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {member.member_type === 'participant' ? 'Part.' : 'Visit.'}
                    </Badge>
                    {!hasPhone && <span className="text-xs text-muted-foreground shrink-0">Sem tel.</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Mensagem */}
          <div className="space-y-2">
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite sua mensagem aqui... Use {nome} para personalizar."
              rows={4}
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground">
              Use {'{nome}'} para o nome da pessoa. Ex.: &quot;Oi {'{nome}'}, não te vimos no último encontro.&quot;
            </p>
          </div>

          {/* Progresso */}
          {sending && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Enviando...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleBroadcast}
            disabled={sending || selectedMembers.length === 0 || !message.trim()}
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Enviar para {selectedMembers.length}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
