import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ok } from "../http.js";
import { requireTrustedOrigin } from "../security/origin.js";
import { requireWebAuth } from "../security/web-auth.js";
import { playgroundChat } from "../services/chat.js";

const schema = z.object({ message: z.string().trim().min(1).max(20_000) });

export async function playgroundRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/playground/chat",
    {
      preHandler: [requireTrustedOrigin, requireWebAuth],
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const body = schema.parse(request.body);
      const user = request.webUser!;
      return ok(reply, await playgroundChat({ userId: user._id, plan: user.plan }, body.message));
    }
  );
}
