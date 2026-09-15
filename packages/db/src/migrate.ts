import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabasePool } from "./index.js";

const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const pool = createDatabasePool();

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const filenames = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const filename of filenames) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [filename]);
    if (applied.rowCount) continue;

    await pool.query("BEGIN");
    try {
      await pool.query(await readFile(join(migrationDirectory, filename), "utf8"));
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await pool.query("COMMIT");
      console.log(`Applied ${filename}`);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await pool.end();
}
