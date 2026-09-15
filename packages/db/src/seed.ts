import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabasePool } from "./index.js";

const seedFile = join(dirname(fileURLToPath(import.meta.url)), "../seeds/development.sql");
const pool = createDatabasePool();

try {
  await pool.query(await readFile(seedFile, "utf8"));
  console.log("Development seed applied");
} finally {
  await pool.end();
}
