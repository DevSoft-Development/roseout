export const STRONG_PASSWORD_MIN_LENGTH = 12;

export const STRONG_PASSWORD_REQUIREMENTS = [
  "At least 12 characters",
  "One uppercase letter",
  "One lowercase letter",
  "One number",
  "One symbol",
];

export function getStrongPasswordErrors(password: string) {
  const errors: string[] = [];

  if (password.length < STRONG_PASSWORD_MIN_LENGTH) {
    errors.push("Password must be at least 12 characters.");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must include an uppercase letter.");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must include a lowercase letter.");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must include a number.");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must include a symbol.");
  }

  return errors;
}

export function isStrongPassword(password: string) {
  return getStrongPasswordErrors(password).length === 0;
}

export function strongPasswordMessage() {
  return STRONG_PASSWORD_REQUIREMENTS.join(", ").replace(/, ([^,]*)$/, ", and $1");
}
