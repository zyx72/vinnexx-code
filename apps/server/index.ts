import type { IncomingMessage, ServerResponse } from "node:http";
import { connectDatabase } from "./src/db.js";
import { buildApp } from "./src/server-app.js";

const appPromise = (async () => {
  await connectDatabase();
  const app = await buildApp();
  await app.ready();
  return app;
})();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await appPromise;
  app.server.emit("request", req, res);
}
