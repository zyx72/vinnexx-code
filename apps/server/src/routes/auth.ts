import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { adminEmails } from "../env.js";
import { collections } from "../db.js";
import { AppError, ok } from "../http.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import {
  createWebSession,
  destroyWebSession,
  optionalWebAuth,
  requireWebAuth
} from "../security/web-auth.js";
import { requireTrustedOrigin } from "../security/origin.js";

const registerSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Username may contain letters, numbers, underscore and hyphen."),
  password: z.string().min(10).max(200)
});

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(200)
});

function publicUser(user: {
  _id: ObjectId;
  email: string;
  username: string;
  plan: string;
  role: string;
  createdAt: Date;
}) {
  return {
    id: user._id.toHexString(),
    email: user.email,
    username: user.username,
    plan: user.plan,
    role: user.role,
    createdAt: user.createdAt.toISOString()
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/register",
    { preHandler: [requireTrustedOrigin], config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const now = new Date();
      const user = {
        _id: new ObjectId(),
        email: body.email,
        username: body.username,
        passwordHash: await hashPassword(body.password),
        plan: "free" as const,
        role: adminEmails.has(body.email) ? ("admin" as const) : ("user" as const),
        createdAt: now,
        updatedAt: now
      };
      try {
        await collections().users.insertOne(user);
      } catch (error) {
        if ((error as { code?: number }).code === 11000) {
          throw new AppError(409, "account_exists", "Email or username is already registered.");
        }
        throw error;
      }
      await createWebSession(reply, user._id);
      return ok(reply, publicUser(user), 201);
    }
  );

  app.post(
    "/auth/login",
    { preHandler: [requireTrustedOrigin], config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const user = await collections().users.findOne({ email: body.email });
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        throw new AppError(401, "invalid_credentials", "Email or password is incorrect.");
      }
      await createWebSession(reply, user._id);
      return ok(reply, publicUser(user));
    }
  );

  app.post(
    "/auth/logout",
    { preHandler: [requireTrustedOrigin] },
    async (request, reply) => {
      await destroyWebSession(request, reply);
      return ok(reply, { loggedOut: true });
    }
  );

  app.get("/auth/me", { preHandler: [optionalWebAuth] }, async (request, reply) => {
    return ok(reply, request.webUser ? publicUser(request.webUser) : null);
  });

  app.delete(
    "/auth/account",
    { preHandler: [requireTrustedOrigin, requireWebAuth] },
    async (request, reply) => {
      const user = request.webUser!;
      await Promise.all([
        collections().devices.updateMany({ userId: user._id }, { $set: { active: false } }),
        collections().webSessions.deleteMany({ userId: user._id }),
        collections().memories.deleteMany({ userId: user._id }),
        collections().chatSessions.deleteMany({ userId: user._id }),
        collections().summaries.deleteMany({ userId: user._id }),
        collections().usageWindows.deleteMany({ userId: user._id })
      ]);
      await collections().users.deleteOne({ _id: user._id });
      reply.clearCookie("vx_session", { path: "/" });
      return ok(reply, { deleted: true });
    }
  );
}
