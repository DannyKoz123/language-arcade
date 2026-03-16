import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { config } from "../config.js";

export function createSessionToken(): string {
  return randomBytes(24).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256")
    .update(`${config.SESSION_SECRET}:${token}`)
    .digest("hex");
}

export function tokensMatch(expected: string, received: string | undefined): boolean {
  if (!received) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
