import crypto from "crypto";

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};
const KEY_LENGTH = 64;
const SALT_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
  const hash = crypto
    .scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS)
    .toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored || typeof stored !== "string") return false;

  let salt: string;
  let storedHash: string;

  if (stored.startsWith("scrypt:")) {
    const parts = stored.split(":");
    if (parts.length !== 3) return false;
    salt = parts[1];
    storedHash = parts[2];
  } else {
    const parts = stored.split(":");
    if (parts.length !== 2) return false;
    salt = parts[0];
    storedHash = parts[1];
  }

  if (!salt || !storedHash) return false;

  try {
    const inputHash = crypto
      .scryptSync(password, salt, KEY_LENGTH, stored.startsWith("scrypt:") ? SCRYPT_PARAMS : undefined)
      .toString("hex");

    const storedBuf = Buffer.from(storedHash, "hex");
    const inputBuf = Buffer.from(inputHash, "hex");

    if (storedBuf.length !== inputBuf.length) return false;

    return crypto.timingSafeEqual(storedBuf, inputBuf);
  } catch {
    return false;
  }
}
