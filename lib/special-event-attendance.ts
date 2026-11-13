/**
 * Presença em encontros especiais com lista pública.
 *
 * Regras:
 * - A confirmação pública (attendance_list_*) NUNCA é gravada como presença sozinha.
 *   Ela só pré-preenche a tela da Agenda como sugestão; quem decide é o líder.
 * - Pessoas que não são membros (autocadastro e convidados da lista) e visitantes avulsos
 *   registrados pelo líder são tratados como visitantes avulsos do encontro
 *   (attendance_guests), igual aos encontros normais.
 *
 * Funções puras, sem acesso a rede ou banco.
 */

export interface ExternalPerson {
  /** Chave estável na tela */
  key: string;
  full_name: string;
  phone: string | null;
  description: string | null;
  /** Marcado como presente */
  present: boolean;
  /** A pessoa confirmou pela lista pública */
  confirmed: boolean;
  origin: 'recorded' | 'public_entry' | 'list_guest' | 'added';
}

export interface RecordedGuestInput {
  full_name: string;
  phone?: string | null;
  description?: string | null;
}

export interface ConfirmedPersonInput {
  id: string;
  full_name: string;
  phone?: string | null;
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Mesma pessoa: mesmo nome e, quando os dois têm telefone, o mesmo telefone. */
export function samePerson(
  a: { full_name: string; phone?: string | null },
  b: { full_name: string; phone?: string | null }
): boolean {
  if (normalizeName(a.full_name) !== normalizeName(b.full_name)) return false;
  const pa = digits(a.phone);
  const pb = digits(b.phone);
  return !pa || !pb || pa === pb;
}

/**
 * Monta a lista de pessoas externas do encontro.
 *
 * `hasRecordedAttendance`: já existe chamada gravada para o encontro. Se existe, quem confirmou
 * mas não está entre os visitantes gravados é considerado ausente (o líder já decidiu);
 * se não existe, a confirmação vale como sugestão de presença.
 */
export function buildExternalPeople(input: {
  recordedGuests: RecordedGuestInput[];
  publicEntries: ConfirmedPersonInput[];
  listGuests: ConfirmedPersonInput[];
  hasRecordedAttendance: boolean;
}): ExternalPerson[] {
  const people: ExternalPerson[] = input.recordedGuests.map((g, i) => ({
    key: `recorded_${i}`,
    full_name: g.full_name,
    phone: g.phone ?? null,
    description: g.description ?? null,
    present: true,
    confirmed: false,
    origin: 'recorded',
  }));

  const addConfirmed = (list: ConfirmedPersonInput[], origin: 'public_entry' | 'list_guest') => {
    for (const c of list) {
      const match = people.find((p) => samePerson(p, c));
      if (match) {
        match.confirmed = true;
        if (!match.phone && c.phone) match.phone = c.phone;
        continue;
      }
      people.push({
        key: `${origin}_${c.id}`,
        full_name: c.full_name,
        phone: c.phone ?? null,
        description: null,
        present: !input.hasRecordedAttendance,
        confirmed: true,
        origin,
      });
    }
  };
  addConfirmed(input.publicEntries, 'public_entry');
  addConfirmed(input.listGuests, 'list_guest');

  return people;
}

/** Visitantes que serão gravados (apenas os marcados como presentes). */
export function guestsPayloadFromPeople(
  people: ExternalPerson[]
): Array<{ full_name: string; phone: string | null; description: string | null }> {
  return people
    .filter((p) => p.present && p.full_name.trim())
    .map((p) => ({
      full_name: p.full_name.trim(),
      phone: p.phone?.trim() || null,
      description: p.description?.trim() || null,
    }));
}
