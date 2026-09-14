/**
 * Short links for UTM links — `/l/<code>` redirects to the link's full,
 * UTM-tagged URL and counts the click.
 *
 * Codes are 7 characters of [a-z0-9]: short enough to say out loud in a video,
 * long enough (78 billion combinations) that guessing live codes is pointless.
 * The redirect target is always the STORED, validated URL for the code, never
 * anything taken from the request — so a short link can't be turned into an
 * open redirect.
 *
 * Pure apart from the injected random source (default: node crypto).
 */

import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const SHORT_CODE_LENGTH = 7;
const SHORT_CODE = /^[a-z0-9]{7}$/;

export function generateShortCode(random: (n: number) => Buffer = randomBytes): string {
  // Rejection sampling keeps every character uniform: 252 = 36 × 7.
  let code = "";
  while (code.length < SHORT_CODE_LENGTH) {
    for (const byte of random(16)) {
      if (byte >= 252) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === SHORT_CODE_LENGTH) break;
    }
  }
  return code;
}

export function isShortCode(code: string): boolean {
  return SHORT_CODE.test(code);
}

/** The public short URL for a code on this deployment's origin. */
export function shortUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/l/${code}`;
}

/** A redirect target is only ever an http(s) URL — anything else is refused. */
export function safeRedirectTarget(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}
