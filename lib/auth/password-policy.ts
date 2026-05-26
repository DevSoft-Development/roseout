export const PASSWORD_MIN_LENGTH = 8;

export function getPasswordChecks(password: string) {
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function isStrongEnoughPassword(password: string) {
  const checks = getPasswordChecks(password);
  return Object.values(checks).every(Boolean);
}
