export type LeaderRole = 'leader' | 'secretary' | 'coordinator';

export function isSecretary(role: LeaderRole | string): boolean {
  return role === 'secretary';
}

export function isCoordinator(role: LeaderRole | string): boolean {
  return role === 'coordinator';
}

export function canManageMeetings(role: LeaderRole | string): boolean {
  return role === 'leader' || role === 'secretary' || role === 'coordinator';
}

/** Líder e secretário podem atrelar participante a discipulador (apenas no grupo). */
export function canManageDiscipleship(role: LeaderRole | string): boolean {
  return role === 'leader' || role === 'secretary';
}

export function canManageSettings(role: LeaderRole | string): boolean {
  return role === 'leader' || role === 'coordinator';
}

export function canManageSecretaries(role: LeaderRole | string): boolean {
  return role === 'leader' || role === 'coordinator';
}

export function canDeleteMembers(role: LeaderRole | string): boolean {
  return role === 'leader' || role === 'coordinator';
}

export function canManageOrganization(role: LeaderRole | string): boolean {
  return role === 'coordinator';
}

export const SECRETARY_FORBIDDEN_MESSAGE =
  'Você não tem permissão para executar esta ação.';
