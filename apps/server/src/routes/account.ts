import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "../db.js";
import { ok } from "../http.js";
import { requireTrustedOrigin } from "../security/origin.js";
import { requireWebAuth } from "../security/web-auth.js";
import { usageView } from "../services/usage.js";

const memorySchema = z.object({
  key: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/),
  value: z.string().trim().min(1).max(4_000)
});
const memoryDeleteSchema = z.object({ key: z.string().trim().min(1).max(64) });

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireWebAuth);

  app.get("/account/usage", async (request, reply) => {
    const user = request.webUser!;
    return ok(reply, await usageView(user._id, user.plan));
  });

  app.get("/account/memory", async (request, reply) => {
    const memories = await collections().memories
      .find({ userId: request.webUser!._id })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();
    return ok(
      reply,
      memories.map((memory) => ({
        key: memory.key,
        value: memory.value,
        updatedAt: memory.updatedAt.toISOString()
      }))
    );
  });

  app.put(
    "/account/memory",
    { preHandler: [requireTrustedOrigin] },
    async (request, reply) => {
      const body = memorySchema.parse(request.body);
      const now = new Date();
      await collections().memories.updateOne(
        { userId: request.webUser!._id, key: body.key },
        {
          $set: { value: body.value, updatedAt: now },
          $setOnInsert: { _id: new ObjectId(), userId: request.webUser!._id, key: body.key, createdAt: now }
        },
        { upsert: true }
      );
      return ok(reply, { saved: true });
    }
  );

  app.delete(
    "/account/memory",
    { preHandler: [requireTrustedOrigin] },
    async (request, reply) => {
      const body = memoryDeleteSchema.parse(request.body);
      await collections().memories.deleteOne({ userId: request.webUser!._id, key: body.key });
      return ok(reply, { deleted: true });
    }
  );

  app.get("/account/summaries", async (request, reply) => {
    const summaries = await collections().summaries
      .find({ userId: request.webUser!._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return ok(
      reply,
      summaries.map((summary) => ({
        id: summary._id.toHexString(),
        prompt: summary.prompt,
        finalAnswer: summary.finalAnswer,
        changes: summary.changes,
        commands: summary.commands,
        createdAt: summary.createdAt.toISOString()
      }))
    );
  });
}
