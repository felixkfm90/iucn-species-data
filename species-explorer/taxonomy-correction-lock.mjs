import fs from "node:fs/promises";
import path from "node:path";
import { loadNodeSqlite } from "./taxonomy-storage.mjs";

// Cross-process exclusion for the small shared correction publication, never for a catalog scan.
export async function withTaxonomyCorrectionLock(taxonomyRoot, operation) {
  const directory = path.join(path.dirname(path.resolve(taxonomyRoot)), "corrections");
  await fs.mkdir(directory, { recursive: true });
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(path.join(directory, "edit-lock.sqlite"));
  try {
    database.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE");
  } catch (error) {
    database.close();
    if ([5, 6].includes(error.errcode)) throw new Error("Eine Namenskorrektur wird bereits verarbeitet. Bitte später erneut versuchen.");
    throw error;
  }
  try {
    return await operation();
  } finally {
    database.close();
  }
}
