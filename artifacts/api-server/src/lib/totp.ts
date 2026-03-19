import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";

const ISSUER = "CurCol";
const PERIOD = 30;
const DIGITS = 6;
const ALGORITHM = "SHA1";

export function generateTOTPSecret(): string {
  const secret = new Secret({ size: 20 });
  return secret.base32;
}

export function createTOTP(secret: string, accountName: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: accountName,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

export function verifyTOTPToken(secret: string, token: string, accountName: string): boolean {
  const totp = createTOTP(secret, accountName);
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

export function getTOTPUri(secret: string, accountName: string): string {
  const totp = createTOTP(secret, accountName);
  return totp.toString();
}

export async function generateQRCodeDataURL(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, {
    width: 256,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
