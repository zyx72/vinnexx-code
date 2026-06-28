import { collections } from "../db.js";
import { DEFAULT_CORE_PROMPT, PROMPT_VERSION, STRUMMER_PROMPT, UNITED_PROMPT } from "../ai/default-prompts.js";
import type { SystemConfigDoc } from "../types.js";

export async function ensureSystemConfig(): Promise<SystemConfigDoc> {
  const existing = await collections().systemConfig.findOne({ _id: "ai" });
  if (!existing || existing.promptVersion !== PROMPT_VERSION) {
    await collections().systemConfig.updateOne(
      { _id: "ai" },
      {
        $set: {
          promptVersion: PROMPT_VERSION,
          corePrompt: DEFAULT_CORE_PROMPT,
          strummerPrompt: STRUMMER_PROMPT,
          unitedPrompt: UNITED_PROMPT,
          updatedAt: new Date()
        },
        $unset: {
          publicModelName: "",
          providerModel: "",
          identityPrompt: ""
        }
      },
      { upsert: true }
    );
  }
  const config = await collections().systemConfig.findOne({ _id: "ai" });
  if (!config) throw new Error("System prompt configuration is unavailable.");
  return config;
}
