import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(3001),
  WEB_PORT: z.coerce.number().default(3000),
  SESSION_SECRET: z.string().min(8),
  ADMIN_TOKEN: z.string().min(8),
  PUBLIC_API_URL: z.string().url()
});

export type AppConfig = z.infer<typeof configSchema>;

export const config = configSchema.parse(process.env);
