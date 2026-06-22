import { ObjectId } from "mongodb";
import { collections } from "../db.js";
import { env } from "../env.js";
import { AppError } from "../http.js";
import { codingTools } from "../ai/tools.js";
import type { ChatSessionDoc, ProviderMessage, RequestAuth } from "../types.js";
import { memoryContext } from "./memory.js";
import { ensureSystemConfig } from "./prompts.js";
import { callOpenRouter } from "./openrouter.js";
import { countVinnexxTokens, refundUsage, reserveUsage, type UsageView } from "./usage.js";

export type ChatTurn =
  | {
      type: "final";
      sessionId: string;
      content: string;
      usage: UsageView;
    }
  | {
      type: "tool_calls";
      sessionId: string;
      calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
      usage: UsageView;
    };

function userPrompt(message: string, workspaceTree: string, language: "en" | "id"): string {
  const languageName = language === "id" ? "Indonesian" : "English";
  return `Respond consistently in ${languageName}.\n\nUser request:\n${message}\n\nTrusted workspace tree (may be truncated):\n${workspaceTree}`;
}

function providerModel(configModel: string): string {
  return env.OPENROUTER_MODEL || configModel;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function startChat(
  auth: RequestAuth,
  input: { message: string; workspaceTree: string; language: "en" | "id" }
): Promise<ChatTurn> {
  const cost = countVinnexxTokens(input.message);
  const usage = await reserveUsage(auth.user._id, auth.user.plan, cost);
  const config = await ensureSystemConfig();
  const memory = await memoryContext(auth.user._id);
  const model = providerModel(config.providerModel);

  const messages: ProviderMessage[] = [
    { role: "system", content: config.corePrompt },
    { role: "system", content: config.identityPrompt },
    { role: "system", content: `Relevant account memory:\n${memory}` },
    { role: "user", content: userPrompt(input.message, input.workspaceTree, input.language) }
  ];

  const now = new Date();
  const session: ChatSessionDoc = {
    _id: new ObjectId(),
    userId: auth.user._id,
    deviceId: auth.device._id,
    messages,
    pendingToolCallIds: [],
    loopCount: 0,
    status: "active",
    createdAt: now,
    updatedAt: now
  };

  await collections().chatSessions.insertOne(session);

  try {
    const result = await callOpenRouter({
      messages,
      model,
      tools: codingTools
    });

    session.messages.push(result.message);
    session.pendingToolCallIds = result.toolCalls.map((call) => call.id);
    session.loopCount = result.toolCalls.length > 0 ? 1 : 0;
    session.status = result.toolCalls.length > 0 ? "active" : "completed";
    session.updatedAt = new Date();
    await collections().chatSessions.replaceOne({ _id: session._id }, session);

    if (result.toolCalls.length > 0) {
      return {
        type: "tool_calls",
        sessionId: session._id.toHexString(),
        calls: result.toolCalls,
        usage
      };
    }

    return {
      type: "final",
      sessionId: session._id.toHexString(),
      content: result.content || "Task completed.",
      usage
    };
  } catch (error) {
    console.error("[openrouter:startChat]", {
      model,
      cause: errorMessage(error)
    });

    await refundUsage(auth.user._id, cost);
    await collections().chatSessions.updateOne(
      { _id: session._id },
      { $set: { status: "failed", updatedAt: new Date() } }
    );

    throw new AppError(
      502,
      "ai_provider_error",
      "Cosmic0.1 could not complete the request. Your reserved tokens were returned.",
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
}

export async function continueChat(
  auth: RequestAuth,
  input: {
    sessionId: string;
    results: Array<{ toolCallId: string; name: string; ok: boolean; output: string }>;
  }
): Promise<ChatTurn> {
  if (!ObjectId.isValid(input.sessionId)) {
    throw new AppError(400, "invalid_session", "Chat session is invalid.");
  }

  const session = await collections().chatSessions.findOne({
    _id: new ObjectId(input.sessionId),
    userId: auth.user._id,
    deviceId: auth.device._id,
    status: "active"
  });

  if (!session) throw new AppError(404, "session_not_found", "Active chat session not found.");
  if (session.loopCount >= 12) {
    throw new AppError(409, "tool_loop_limit", "Tool loop limit reached.");
  }

  const expected = new Set(session.pendingToolCallIds);
  if (
    input.results.length !== expected.size ||
    input.results.some((result) => !expected.has(result.toolCallId))
  ) {
    throw new AppError(409, "tool_result_mismatch", "Tool results do not match the pending calls.");
  }

  for (const result of input.results) {
    session.messages.push({
      role: "tool",
      tool_call_id: result.toolCallId,
      content: JSON.stringify({ ok: result.ok, tool: result.name, output: result.output })
    });
  }

  const config = await ensureSystemConfig();
  const model = providerModel(config.providerModel);

  try {
    const result = await callOpenRouter({
      messages: session.messages,
      model,
      tools: codingTools
    });

    session.messages.push(result.message);
    session.pendingToolCallIds = result.toolCalls.map((call) => call.id);
    session.loopCount += 1;
    session.status = result.toolCalls.length > 0 ? "active" : "completed";
    session.updatedAt = new Date();
    await collections().chatSessions.replaceOne({ _id: session._id }, session);

    const usage = await import("./usage.js").then(({ usageView }) =>
      usageView(auth.user._id, auth.user.plan)
    );

    if (result.toolCalls.length > 0) {
      return {
        type: "tool_calls",
        sessionId: session._id.toHexString(),
        calls: result.toolCalls,
        usage
      };
    }

    return {
      type: "final",
      sessionId: session._id.toHexString(),
      content: result.content || "Task completed.",
      usage
    };
  } catch (error) {
    console.error("[openrouter:continueChat]", {
      model,
      cause: errorMessage(error)
    });

    await collections().chatSessions.updateOne(
      { _id: session._id },
      { $set: { status: "failed", updatedAt: new Date() } }
    );

    throw new AppError(
      502,
      "ai_provider_error",
      "Cosmic0.1 could not continue after the tool result.",
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
}

export async function playgroundChat(
  auth: { userId: ObjectId; plan: "free" | "pro" },
  message: string
): Promise<{ content: string; usage: UsageView }> {
  const cost = countVinnexxTokens(message);
  const usage = await reserveUsage(auth.userId, auth.plan, cost);
  const config = await ensureSystemConfig();
  const memory = await memoryContext(auth.userId);
  const model = providerModel(config.providerModel);

  try {
    const result = await callOpenRouter({
      model,
      messages: [
        { role: "system", content: config.corePrompt },
        { role: "system", content: config.identityPrompt },
        { role: "system", content: `Relevant account memory:\n${memory}` },
        { role: "user", content: message }
      ]
    });

    return { content: result.content || "No response.", usage };
  } catch (error) {
    console.error("[openrouter:playgroundChat]", {
      model,
      cause: errorMessage(error)
    });

    await refundUsage(auth.userId, cost);
    throw new AppError(502, "ai_provider_error", "Cosmic0.1 is temporarily unavailable.", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}
