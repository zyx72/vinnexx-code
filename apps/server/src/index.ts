import { buildApp } from "./server-app.js";
import { closeDatabase, connectDatabase } from "./db.js";
import { env } from "./env.js";
import { ensureSystemConfig } from "./services/prompts.js";

const app = await buildApp();

async function start(): Promise<void> {
  await connectDatabase();
  await ensureSystemConfig();
  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(`Vinnexx Server v0.3.0 listening on ${env.HOST}:${env.PORT}`);
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await closeDatabase();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

void start().catch(async (error) => {
  app.log.error({ err: error }, "Failed to start Vinnexx Server");
  await closeDatabase();
  process.exitCode = 1;
});
