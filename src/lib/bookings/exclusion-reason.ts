/**
 * Why a booking is out of the numbers, as typed. Required, so the restore bin
 * always says why each call is missing from the rates. Pure.
 */

/** The tidy reason, or why it can't be saved. */
export function validateExclusionReason(
  raw: string,
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = raw.trim().replace(/\s+/g, " ");
  if (reason.length < 3) {
    return {
      ok: false,
      error: "Say why this call is out of the numbers (3+ characters).",
    };
  }
  if (reason.length > 200) {
    return { ok: false, error: "Keep the reason to 200 characters." };
  }
  return { ok: true, reason };
}
