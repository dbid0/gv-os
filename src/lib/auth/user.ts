import "server-only";

import { currentUser } from "@/lib/auth/server";

/** What the shell needs to render a person. Serialisable, so it crosses to client components. */
export type ShellUser = {
  email: string;
  initial: string;
  name: string;
};

/**
 * The signed-in person, shaped for display.
 *
 * Falls back to the local part of the address when there is no display name,
 * because "daniel" beats an empty space in the sidebar.
 */
export async function shellUser(): Promise<ShellUser | null> {
  const user = await currentUser();
  if (!user?.email) return null;

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "";
  const local = user.email.split("@")[0] ?? "";
  const name = metadataName || local.charAt(0).toUpperCase() + local.slice(1);

  return {
    email: user.email,
    name,
    initial: (name.charAt(0) || user.email.charAt(0)).toUpperCase(),
  };
}
