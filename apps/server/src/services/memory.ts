import type { ObjectId } from "mongodb";
import { collections } from "../db.js";

export async function memoryContext(userId: ObjectId): Promise<string> {
  const memories = await collections().memories
    .find({ userId })
    .sort({ updatedAt: -1 })
    .limit(30)
    .toArray();
  if (memories.length === 0) return "No saved user memories.";
  return memories.map((item) => `- ${item.key}: ${item.value}`).join("\n");
}
