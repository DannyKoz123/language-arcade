import { createHash, randomBytes } from "node:crypto";

import { config } from "../config.js";

export function createSessionToken(): string {
  return randomBytes(24).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256")
    .update(`${config.SESSION_SECRET}:${token}`)
    .digest("hex");
}
