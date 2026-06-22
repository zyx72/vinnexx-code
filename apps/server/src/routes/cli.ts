import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "../db.js";
import { AppError, ok } from "../http.js";
import { requireDeviceAuth } from "../security/device-auth.js";
import { continueChat, startChat } from "../services/chat.js";
import { usageView } from "../services/usage.js";

const chatStartSchema = z.object({
  message: z.string().trim().min(1).max(50_000),
  workspaceTree: z.string().max(25_000),
  language: z.enum(["en", "id"]).default("en")
});

const toolResultSchema = z.object({
  sessionId: z.string(),
  results: z
    .array(
      z.object({
        toolCallId: z.string().min(1).max(200),
        name: z.string().min(1).max(80),
        ok: z.boolean(),
        output: z.string().max(30_000)
      })
    )
    .min(1)
    .max(20)
});

const memorySchema = z.object({
  key: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/),
  value: z.string().trim().min(1).max(4_000)
});

const summarySchema = z.object({
  sessionId: z.string(),
  prompt: z.string().max(50_000),
  finalAnswer: z.string().max(100_000),
  changes: z
    .array(
      z.object({
        path: z.string().max(1_000),
        kind: z.enum(["created", "edited", "deleted"])
      })
    )
    .max(1_000),
  commands: z.array(z.string().max(5_000)).max(100)
});

export async function cliRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireDeviceAuth);

  app.get("/cli/account", async (request, reply) => {
    const user = request.deviceAuth!.user;
    return ok(reply, {
      id: user._id.toHexString(),
      username: user.username,
      email: user.email,
      plan: user.plan
    });
  });

  app.get("/cli/usage", async (request, reply) => {
    const user = request.deviceAuth!.user;
    return ok(reply, await usageView(user._id, user.plan));
  });

  app.post(
    "/cli/chat/start",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = chatStartSchema.parse(request.body);

      return ok(
        reply,
        await startChat(request.deviceAuth!, {
          message: body.message ?? "",
          workspaceTree: body.workspaceTree ?? "",
          language: body.language ?? "en"
        })
      );
    }
  );

  app.post(
    "/cli/chat/tool-result",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = toolResultSchema.parse(request.body);

      return ok(
        reply,
        await continueChat(request.deviceAuth!, {
          sessionId: body.sessionId ?? "",
          results: (body.results ?? []).map((item) => ({
            toolCallId: item.toolCallId ?? "",
            name: item.name ?? "",
            ok: item.ok ?? false,
            output: item.output ?? ""
          }))
        })
      );
    }
  );

  app.get("/cli/memory", async (request, reply) => {
    const memories = await collections().memories
      .find({ userId: request.deviceAuth!.user._id })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();

    return ok(
      reply,
      memories.map((item) => ({
        key: item.key,
        value: item.value,
        updatedAt: item.updatedAt.toISOString()
      }))
    );
  });

  app.put("/cli/memory", async (request, reply) => {
    const body = memorySchema.parse(request.body);
    const now = new Date();

    await collections().memories.updateOne(
      { userId: request.deviceAuth!.user._id, key: body.key },
      {
        $set: {
          value: body.value,
          updatedAt: now
        },
        $setOnInsert: {
          _id: new ObjectId(),
          userId: request.deviceAuth!.user._id,
          key: body.key,
          createdAt: now
        }
      },
      { upsert: true }
    );

    return ok(reply, { key: body.key, value: body.value });
  });

  app.post("/cli/task/complete", async (request, reply) => {
    const body = summarySchema.parse(request.body);

    if (!ObjectId.isValid(body.sessionId)) {
      throw new AppError(400, "invalid_session", "Chat session is invalid.");
    }

    const changes = (body.changes ?? []).map((item) => ({
      path: item.path ?? "",
      kind: item.kind ?? "edited"
    }));

    const commands = body.commands ?? [];
    const sessionId = new ObjectId(body.sessionId);

    const session = await collections().chatSessions.findOne({
      _id: sessionId,
      userId: request.deviceAuth!.user._id,
      deviceId: request.deviceAuth!.device._id
    });

    if (!session) {
      throw new AppError(404, "session_not_found", "Chat session not found.");
    }

    await collections().summaries.updateOne(
      { sessionId, userId: request.deviceAuth!.user._id },
      {
        $set: {
          deviceId: request.deviceAuth!.device._id,
          prompt: body.prompt,
          finalAnswer: body.finalAnswer,
          changes,
          commands,
          createdAt: new Date()
        },
        $setOnInsert: {
          _id: new ObjectId(),
          sessionId,
          userId: request.deviceAuth!.user._id
        }
      },
      { upsert: true }
    );

    return ok(reply, { saved: true });
  });

  app.post("/cli/device/logout", async (request, reply) => {
    await collections().devices.updateOne(
      { _id: request.deviceAuth!.device._id },
      { $set: { active: false } }
    );

    return ok(reply, { revoked: true });
  });
}
