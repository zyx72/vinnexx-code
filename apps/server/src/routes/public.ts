import type { FastifyInstance } from "fastify";
import { ok } from "../http.js";
import { env } from "../env.js";

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    return ok(reply, {
      status: "ok",
      service: "vinnexx-server",
      version: "0.2.0",
      aiConfigured: Boolean(env.OPENROUTER_API_KEY),
      time: new Date().toISOString()
    });
  });
}
