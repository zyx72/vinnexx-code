import { collections } from "../db.js";
import { env } from "../env.js";
import { DEFAULT_CORE_PROMPT, DEFAULT_IDENTITY_PROMPT } from "../ai/default-prompts.js";
import type { SystemConfigDoc } from "../types.js";

export async function ensureSystemConfig(): Promise<SystemConfigDoc> {
  const existing = await collections().systemConfig.findOne({ _id: "ai" });

  if (existing) {
    const isLegacy =
      existing.publicModelName !== "Cosmic0.1" ||
      existing.identityPrompt.includes("Sora0.5") ||
      existing.corePrompt.includes("Sora0.5");

    if (!isLegacy) return existing;

    const updated: SystemConfigDoc = {
      ...existing,
      publicModelName: "Cosmic0.1",
      providerModel: env.OPENROUTER_MODEL,
      corePrompt: DEFAULT_CORE_PROMPT,
      identityPrompt: DEFAULT_IDENTITY_PROMPT,
      updatedAt: new Date()
    };

    await collections().systemConfig.updateOne(
      { _id: "ai" },
      {
        $set: {
          publicModelName: updated.publicModelName,
          providerModel: updated.providerModel,
          corePrompt: updated.corePrompt,
          identityPrompt: updated.identityPrompt,
          updatedAt: updated.updatedAt
        }
      }
    );

    return updated;
  }

  const config: SystemConfigDoc = {
    _id: "ai",
    publicModelName: "Cosmic0.1",
    providerModel: env.OPENROUTER_MODEL,
    corePrompt: DEFAULT_CORE_PROMPT,
    identityPrompt: DEFAULT_IDENTITY_PROMPT,
    updatedAt: new Date()
  };

  await collections().systemConfig.insertOne(config).catch(async (error) => {
    if ((error as { code?: number }).code !== 11000) throw error;
  });

  return (await collections().systemConfig.findOne({ _id: "ai" })) ?? config;
}
