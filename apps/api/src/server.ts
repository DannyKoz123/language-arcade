import { createApp } from "./app.js";
import { config } from "./config.js";

async function start(): Promise<void> {
  const app = await createApp();
  await app.listen({
    port: config.API_PORT,
    host: "0.0.0.0"
  });
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
