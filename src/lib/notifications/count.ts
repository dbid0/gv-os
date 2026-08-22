import "server-only";

import { count, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { notifications } from "@/db/schema/app";

/** Unread badge count — fail-soft: the shell renders even if this read fails. */
export async function unreadNotificationCount(): Promise<number> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ n: count() })
      .from(notifications)
      .where(isNull(notifications.readAt));
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}
