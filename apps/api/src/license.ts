/**
 * License / OTP primitives — Web Crypto only, so the same code runs in the
 * Cloudflare Worker AND in Node (tests, local scripts). No Node built-ins.
 *
 * Security notes:
 *  - License codes are never stored in plaintext — only their SHA-256 hash
 *    is persisted, so a store leak does not leak activatable codes.
 *  - OTP records are keyed by a hash of `email|otp`, so the store reveals
 *    neither the code nor the address it belongs to.
 */

const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time string comparison (no short-circuit on mismatch). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Cryptographically random integer in [0, max). */
export function randomInt(max: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 0) % max;
}

/** Same normalization the app uses: uppercase, strip noise, group in 4s. */
export function normalizeCode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (cleaned.match(/.{1,4}/g) ?? []).join('-');
}

/** Loose shape check (blocks of 3–6 alphanumerics, ≥ 8 chars total). */
export function isWellFormedCode(code: string): boolean {
  if (!code) return false;
  const blocks = code.split('-');
  const totalLength = code.replace(/-/g, '').length;
  return totalLength >= 8 && blocks.every((block) => /^[A-Z0-9]{3,6}$/.test(block));
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function hashCode(code: string): Promise<string> {
  return sha256Hex(normalizeCode(code));
}

export async function hashEmail(email: string): Promise<string> {
  return sha256Hex(email.trim().toLowerCase());
}

/** Storage key for an OTP record — hides both the code and the email. */
export async function hashOtpKey(email: string, otp: string): Promise<string> {
  return sha256Hex(`${email.trim().toLowerCase()}|${otp}`);
}

export function generateOtp(): string {
  return String(randomInt(1_000_000)).padStart(6, '0');
}

/**
 * Random license code in the display format XXXX-XXXX-XXXX-XXXX, avoiding
 * ambiguous characters (0/O, 1/I/L). Used by the admin endpoint and tests.
 */
export function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const group = () => {
    let out = '';
    for (let i = 0; i < 4; i += 1) {
      out += alphabet[randomInt(alphabet.length)];
    }
    return out;
  };
  return `${group()}-${group()}-${group()}-${group()}`;
}

/** Cap and tidy a client-supplied phone label. Empty / junk → null. */
export const DEVICE_LABEL_MAX = 40;

export function sanitizeDeviceLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, DEVICE_LABEL_MAX);
}

export function alreadyActiveMessage(label: string | null): string {
  const where = label ? ` on ${label}` : ' on another device';
  return `This license is already active${where}. Deactivate there first, or use “I don’t have that device” on this screen if it’s gone.`;
}