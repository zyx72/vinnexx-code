import type { VercelRequest, VercelResponse } from "@vercel/node";
import Fastify from "fastify";
import { connectDatabase } from "./src/db.js";
import { buildApp } from "./src/server-app.js";

void Fastify;

const appPromise = (async () => {
  await connectDatabase();
  const app = await buildApp();
  await app.ready();
  return app;
})();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await appPromise;
  app.server.emit("request", req, res);
}
