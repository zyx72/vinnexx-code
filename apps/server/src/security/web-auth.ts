import type { FastifyReply, FastifyRequest } from "fastify";
import { ObjectId } from "mongodb";
import { collections } from "../db.js";
import { AppError } from "../http.js";
import { env } from "../env.js";
import { randomToken, sha256 } from "./crypto.js";
import type { UserDoc } from "../types.js";

const COOKIE_NAME = "vx_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function createWebSession(reply: FastifyReply, userId: ObjectId): Promise<void> {
  const token = randomToken(32);
  const now = new Date();
  await collections().webSessions.insertOne({
    _id: new ObjectId(),
    tokenHash: sha256(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_AGE_SECONDS * 1000)
  });
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: SESSION_AGE_SECONDS,
  });
}

export async function destroyWebSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[COOKIE_NAME];
  if (token) await collections().webSessions.deleteOne({ tokenHash: sha256(token) });
  reply.clearCookie(COOKIE_NAME, { path: "/" });
}

export async function resolveWebUser(request: FastifyRequest): Promise<UserDoc | null> {
  const token = request.cookies[COOKIE_NAME];
  if (!token) return null;
  const session = await collections().webSessions.findOne({
    tokenHash: sha256(token),
    expiresAt: { $gt: new Date() }
  });
  if (!session) return null;
  return collections().users.findOne({ _id: session.userId });
}

export async function optionalWebAuth(request: FastifyRequest): Promise<void> {
  const user = await resolveWebUser(request);
  if (user) request.webUser = user;
}

export async function requireWebAuth(request: FastifyRequest): Promise<void> {
  const user = await resolveWebUser(request);
  if (!user) throw new AppError(401, "not_authenticated", "Sign in to continue.");
  request.webUser = user;
}

export async function requireAdmin(request: FastifyRequest): Promise<void> {
  await requireWebAuth(request);
  if (request.webUser?.role !== "admin") {
    throw new AppError(403, "admin_required", "Administrator access is required.");
  }
}

export function parseObjectId(value: string, label = "id"): ObjectId {
  if (!ObjectId.isValid(value)) throw new AppError(400, "invalid_id", `${label} is invalid.`);
  return new ObjectId(value);
}
