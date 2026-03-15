import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Pool } from "pg";

import { config } from "../config.js";

let poolSingleton: Pool | null = null;

export function getPool(): Pool {
  if (!poolSingleton) {
    poolSingleton = new Pool({
      connectionString: config.DATABASE_URL
    });
  }

  return poolSingleton;
}

export async function runSqlFile(relativePath: string): Promise<void> {
  const sql = await readFile(join(process.cwd(), relativePath), "utf8");
  await getPool().query(sql);
}

export async function closePool(): Promise<void> {
  if (poolSingleton) {
    await poolSingleton.end();
    poolSingleton = null;
  }
}
