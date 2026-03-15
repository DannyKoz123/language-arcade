import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { closePool, getPool } from "../db/pool.js";

async function migrate(): Promise<void> {
  const migrationsPath = join(process.cwd(), "src", "db", "migrations");
  const files = (await readdir(migrationsPath)).sort();
  const pool = getPool();

  for (const file of files) {
    const fullPath = join(migrationsPath, file);
    const sql = await readFile(fullPath, "utf8");

    await pool.query(sql);
    console.log(`Applied migration ${file}`);
  }
}

migrate()
  .then(async () => {
    await closePool();
  })
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exitCode = 1;
  });
