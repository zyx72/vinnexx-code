import { ObjectId } from "mongodb";
import { collections } from "../db.js";
import { env } from "../env.js";
import { AppError } from "../http.js";
import type { Plan, UsageWindowDoc } from "../types.js";

export type UsageView = {
  plan: Plan;
  used: number;
  limit: number | null;
  remaining: number | null;
  resetAt: string;
};

export function countVinnexxTokens(text: string): number {
  const characters = Array.from(text).length;
  return characters === 0 ? 0 : Math.ceil(characters / env.CHARACTERS_PER_TOKEN);
}

export function currentBucket(now = new Date()): { start: Date; resetAt: Date } {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  return { start, resetAt: new Date(start.getTime() + 60 * 60_000) };
}

export async function usageView(userId: ObjectId, plan: Plan): Promise<UsageView> {
  const { start, resetAt } = currentBucket();
  if (plan !== "free") {
    return { plan, used: 0, limit: null, remaining: null, resetAt: resetAt.toISOString() };
  }
  const window = await collections().usageWindows.findOne({ userId, bucketStart: start });
  const used = window?.used ?? 0;
  return {
    plan,
    used,
    limit: env.FREE_HOURLY_TOKENS,
    remaining: Math.max(0, env.FREE_HOURLY_TOKENS - used),
    resetAt: resetAt.toISOString()
  };
}

export async function reserveUsage(
  userId: ObjectId,
  plan: Plan,
  cost: number
): Promise<UsageView> {
  if (plan !== "free") return usageView(userId, plan);
  const { start, resetAt } = currentBucket();
  const limit = env.FREE_HOURLY_TOKENS;
  if (cost > limit) {
    throw new AppError(429, "quota_exceeded", "This request exceeds the hourly token limit.", {
      remaining: limit,
      resetAt: resetAt.toISOString()
    });
  }

  const now = new Date();
  let updated = await collections().usageWindows.findOneAndUpdate(
    { userId, bucketStart: start, used: { $lte: limit - cost } },
    { $inc: { used: cost }, $set: { updatedAt: now } },
    { returnDocument: "after" }
  );

  if (!updated) {
    try {
      const doc: UsageWindowDoc = {
        _id: new ObjectId(),
        userId,
        bucketStart: start,
        used: cost,
        limit,
        createdAt: now,
        updatedAt: now
      };
      await collections().usageWindows.insertOne(doc);
      updated = doc;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      updated = await collections().usageWindows.findOneAndUpdate(
        { userId, bucketStart: start, used: { $lte: limit - cost } },
        { $inc: { used: cost }, $set: { updatedAt: now } },
        { returnDocument: "after" }
      );
    }
  }

  if (!updated) {
    const view = await usageView(userId, plan);
    throw new AppError(429, "quota_exceeded", "Hourly token limit reached.", {
      remaining: view.remaining,
      resetAt: view.resetAt
    });
  }

  return {
    plan,
    used: updated.used,
    limit,
    remaining: Math.max(0, limit - updated.used),
    resetAt: resetAt.toISOString()
  };
}

export async function refundUsage(userId: ObjectId, cost: number): Promise<void> {
  if (cost <= 0) return;
  const { start } = currentBucket();
  await collections().usageWindows.updateOne(
    { userId, bucketStart: start },
    [{ $set: { used: { $max: [0, { $subtract: ["$used", cost] }] }, updatedAt: new Date() } }]
  );
}
