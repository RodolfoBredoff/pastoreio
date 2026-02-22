/**
 * Regras de senha: mais de 10 caracteres, uma maiúscula, uma minúscula e um número.
 */
export const PASSWORD_MIN_LENGTH = 11;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{11,}$/;

export const PASSWORD_REQUIREMENTS_TEXT =
  'A senha deve ter mais de 10 caracteres, incluindo pelo menos uma letra maiúscula, uma minúscula e um número.';

export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Senha é obrigatória' };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: PASSWORD_REQUIREMENTS_TEXT };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: PASSWORD_REQUIREMENTS_TEXT };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: PASSWORD_REQUIREMENTS_TEXT };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: PASSWORD_REQUIREMENTS_TEXT };
  }
  return { valid: true };
}

/** Gera uma senha aleatória que atende às regras (12 caracteres: maiúscula, minúscula, número) */
export function generateRandomPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const all = upper + lower + numbers;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let p = pick(upper) + pick(lower) + pick(numbers);
  for (let i = 0; i < 9; i++) p += pick(all);
  return p.split('').sort(() => Math.random() - 0.5).join('');
}
