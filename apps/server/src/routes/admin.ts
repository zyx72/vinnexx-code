import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { collections } from "../db.js";
import { ok } from "../http.js";
import { requireTrustedOrigin } from "../security/origin.js";
import { parseObjectId, requireAdmin } from "../security/web-auth.js";
import { ensureSystemConfig } from "../services/prompts.js";

const planSchema = z.object({ userId: z.string(), plan: z.enum(["free", "pro"]) });
const configSchema = z.object({
  publicModelName: z.string().trim().min(1).max(80),
  providerModel: z.string().trim().min(1).max(160),
  corePrompt: z.string().min(20).max(100_000),
  identityPrompt: z.string().min(10).max(20_000)
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

  app.get("/admin/users", async (_request, reply) => {
    const users = await collections().users.find({}).sort({ createdAt: -1 }).limit(500).toArray();
    return ok(
      reply,
      users.map((user) => ({
        id: user._id.toHexString(),
        email: user.email,
        username: user.username,
        plan: user.plan,
        role: user.role,
        createdAt: user.createdAt.toISOString()
      }))
    );
  });

  app.put(
    "/admin/users/plan",
    { preHandler: [requireTrustedOrigin] },
    async (request, reply) => {
      const body = planSchema.parse(request.body);
      const userId = parseObjectId(body.userId, "userId");
      await collections().users.updateOne(
        { _id: userId },
        { $set: { plan: body.plan, updatedAt: new Date() } }
      );
      return ok(reply, { updated: true });
    }
  );

  app.get("/admin/system-config", async (_request, reply) => {
    return ok(reply, await ensureSystemConfig());
  });

  app.put(
    "/admin/system-config",
    { preHandler: [requireTrustedOrigin] },
    async (request, reply) => {
      const body = configSchema.parse(request.body);
      await collections().systemConfig.updateOne(
        { _id: "ai" },
        { $set: { ...body, updatedAt: new Date() } },
        { upsert: true }
      );
      return ok(reply, { updated: true });
    }
  );
}
