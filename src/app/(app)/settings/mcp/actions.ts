"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { currentUser } from "@/lib/auth/server";
import { createMcpKey, revokeMcpKey } from "@/lib/mcp/keys-store";

/** A key reads the whole agency, so only an admin may mint or revoke one. */
async function requireAdmin(): Promise<string | null> {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if ((await resolveRealRole(user.email)) !== "admin") {
    throw new Error("Only an admin can manage MCP keys.");
  }
  return user.email;
}

export async function createMcpKeyAction(
  name: string,
): Promise<{ ok: true; key: string } | { ok: false; reason: string }> {
  const by = await requireAdmin();
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 60) {
    return {
      ok: false,
      reason:
        'Name the key after where it will live, like "office laptop" (up to 60 characters).',
    };
  }
  const { key } = await createMcpKey(clean, by);
  revalidatePath("/settings/mcp");
  return { ok: true, key };
}

export async function revokeMcpKeyAction(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, reason: "That key no longer exists." };
  }
  const done = await revokeMcpKey(id);
  revalidatePath("/settings/mcp");
  return done ? { ok: true } : { ok: false, reason: "That key is already revoked." };
}
