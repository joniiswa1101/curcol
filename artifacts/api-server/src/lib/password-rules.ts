export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

export function validatePasswordComplexity(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password) {
    errors.push("Password tidak boleh kosong");
    return { valid: false, errors };
  }

  if (password.length < MIN_LENGTH) {
    errors.push(`Password minimal ${MIN_LENGTH} karakter (saat ini: ${password.length})`);
  }

  if (password.length > MAX_LENGTH) {
    errors.push(`Password maksimal ${MAX_LENGTH} karakter`);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password harus mengandung minimal 1 huruf besar (A-Z)");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password harus mengandung minimal 1 huruf kecil (a-z)");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password harus mengandung minimal 1 angka (0-9)");
  }

  if (!/[!@#$%^&*\-_=+[\]{};:'",<>.?\/\\|`~]/.test(password)) {
    errors.push("Password harus mengandung minimal 1 karakter spesial (!@#$%^&* dll)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getPasswordRequirements(): string {
  return `Password harus memenuhi kriteria berikut:\n` +
    `• Minimal ${MIN_LENGTH} karakter\n` +
    `• Mengandung huruf besar (A-Z)\n` +
    `• Mengandung huruf kecil (a-z)\n` +
    `• Mengandung angka (0-9)\n` +
    `• Mengandung karakter spesial (!@#$%^&* dll)`;
}
