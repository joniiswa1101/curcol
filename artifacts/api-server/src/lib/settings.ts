import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getSetting(key: string, defaultValue: string = ""): Promise<string> {
  const [row] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, key));
  return row ? row.value : defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, key));

  if (existing) {
    await db
      .update(systemSettingsTable)
      .set({ value, updatedAt: new Date() })
      .where(eq(systemSettingsTable.key, key));
  } else {
    await db.insert(systemSettingsTable).values({ key, value, updatedAt: new Date() });
  }
}

export async function is2FASystemEnabled(): Promise<boolean> {
  const val = await getSetting("2fa_enabled", "false");
  return val === "true";
}
