import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 32;

// Pas de nouvelle dépendance (bcrypt/argon2) : scrypt est déjà dans Node.
// Un PIN à 4-6 chiffres a un espace de clés minuscule (≤ 1 000 000) — la
// vraie protection contre le brute-force est le rate-limit EN LIGNE
// (pin_attempts, voir lockActions.ts), pas la robustesse du hachage.
// scrypt sert uniquement à ne jamais stocker le PIN en clair.
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scryptAsync(pin, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scryptAsync(pin, salt, expected.length)) as Buffer;

  // timingSafeEqual exige des buffers de même longueur — un hash stocké
  // corrompu/tronqué ne doit jamais faire planter la comparaison.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
