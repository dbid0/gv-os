import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Sealed storage for integration credentials.
 *
 * API keys live in Postgres only as AES-256-GCM ciphertext; the master key
 * lives only in the environment (CREDENTIALS_KEY, 32 bytes base64). A database
 * dump alone can never yield a client's API key, and GCM's auth tag means a
 * tampered row fails loudly instead of decrypting to garbage.
 *
 * Pure functions — the key is always an argument, never read from the
 * environment here, so every path is unit-testable. Reading the environment is
 * the caller's job (see the integrations server actions).
 */

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function keyFromBase64(keyB64: string): Buffer {
  let key: Buffer;
  try {
    key = Buffer.from(keyB64, "base64");
  } catch {
    throw new Error("CREDENTIALS_KEY is not valid base64.");
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CREDENTIALS_KEY must decode to exactly ${KEY_BYTES} bytes, got ${key.length}.`,
    );
  }
  return key;
}

/** Encrypts a secret. Returns `v1.<iv>.<tag>.<ciphertext>`, all base64. */
export function seal(plaintext: string, keyB64: string): string {
  if (plaintext.length === 0) throw new Error("Refusing to seal an empty secret.");
  const key = keyFromBase64(keyB64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/** Decrypts a sealed box. Throws on tampering, wrong key, or a bad format. */
export function open(box: string, keyB64: string): string {
  const key = keyFromBase64(keyB64);
  const parts = box.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognized sealed-secret format.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Sealed secret failed to decrypt — wrong key or tampered data.");
  }
}

/**
 * The displayable hint for a stored secret ("…a1b2"). The UI shows ONLY this;
 * the plaintext never travels back to the browser after connect.
 */
export function secretHint(secret: string): string {
  const tail = secret.slice(-4);
  return `…${tail}`;
}
