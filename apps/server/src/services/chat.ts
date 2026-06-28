import { ObjectId } from "mongodb";
import { collections } from "../db.js";
import { AppError } from "../http.js";
import { codingTools } from "../ai/tools.js";
import type {
  ChatSessionDoc,
  GatewayMessage,
  PublicMode,
  RequestAuth,
  StoredTurn
} from "../types.js";
import { memoryContext } from "./memory.js";
import { ensureSystemConfig } from "./prompts.js";
import { callModelGateway, GatewayTimeoutError } from "./model-gateway.js";
import { countVinnexxTokens, refundUsage, reserveUsage, usageView, type UsageView } from "./usage.js";

export type ChatTurn =
  | { type: "final"; sessionId: string; content: string; usage: UsageView }
  | {
      type: "tool_calls";
      sessionId: string;
      calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
      usage: UsageView;
    };

function userPrompt(message: string, workspaceTree: string, language: "en" | "id"): string {
  const languageName = language === "id" ? "Indonesian" : "English";
  return `Respond consistently in ${languageName}.\n\nUser request:\n${message}\n\nTrusted workspace tree (may be truncated):\n${workspaceTree || "(not supplied)"}`;
}

function modePrompt(config: Awaited<ReturnType<typeof ensureSystemConfig>>, mode: PublicMode): string {
  return mode === "united" ? config.unitedPrompt : config.strummerPrompt;
}

async function toTurn(session: ChatSessionDoc): Promise<ChatTurn> {
  const usage = await usageView(session.userId, (await collections().users.findOne({ _id: session.userId }))?.plan ?? "free");
  if (session.lastTurn.type === "tool_calls") {
    return { type: "tool_calls", sessionId: session._id.toHexString(), calls: session.lastTurn.calls, usage };
  }
  return {
    type: "final",
    sessionId: session._id.toHexString(),
    content: session.lastTurn.content || "No final response was produced.",
    usage
  };
}

function storedTurn(result: Awaited<ReturnType<typeof callModelGateway>>): StoredTurn {
  return result.toolCalls.length > 0
    ? { type: "tool_calls", calls: result.toolCalls }
    : { type: "final", content: result.content || "Task completed." };
}

function logFailure(stage: "start" | "review" | "playground", requestId: string, error: unknown): void {
  console.error("[model-request]", {
    stage,
    requestId,
    category: error instanceof GatewayTimeoutError ? "timeout" : "failure"
  });
}

export async function startChat(
  auth: RequestAuth,
  input: {
    message: string;
    workspaceTree: string;
    language: "en" | "id";
    publicMode: PublicMode;
    requestId: string;
  }
): Promise<ChatTurn> {
  const duplicate = await collections().chatSessions.findOne({
    deviceId: auth.device._id,
    requestId: input.requestId
  });
  if (duplicate) return toTurn(duplicate);

  const config = await ensureSystemConfig();
  const memory = await memoryContext(auth.user._id);
  const messages: GatewayMessage[] = [
    { role: "system", content: config.corePrompt },
    { role: "system", content: modePrompt(config, input.publicMode) },
    { role: "system", content: `Relevant account memory:\n${memory}` },
    { role: "user", content: userPrompt(input.message, input.workspaceTree, input.language) }
  ];
  const now = new Date();
  const session: ChatSessionDoc = {
    _id: new ObjectId(),
    userId: auth.user._id,
    deviceId: auth.device._id,
    requestId: input.requestId,
    publicMode: input.publicMode,
    messages,
    pendingToolCallIds: [],
    loopCount: 0,
    lastTurn: { type: "final", content: "" },
    status: "active",
    createdAt: now,
    updatedAt: now
  };

  try {
    await collections().chatSessions.insertOne(session);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const existing = await collections().chatSessions.findOne({
        deviceId: auth.device._id,
        requestId: input.requestId
      });
      if (existing) return toTurn(existing);
    }
    throw error;
  }

  const cost = countVinnexxTokens(input.message);
  let usage: UsageView;
  try {
    usage = await reserveUsage(auth.user._id, auth.user.plan, cost);
  } catch (error) {
    await collections().chatSessions.updateOne(
      { _id: session._id },
      { $set: { status: "failed", updatedAt: new Date() } }
    );
    throw error;
  }

  try {
    const result = await callModelGateway({ messages, tools: codingTools, phase: "initial" });
    session.messages.push(result.message);
    session.pendingToolCallIds = result.toolCalls.map((call) => call.id);
    session.loopCount = result.toolCalls.length > 0 ? 1 : 0;
    session.lastTurn = storedTurn(result);
    session.status = result.toolCalls.length > 0 ? "active" : "completed";
    session.updatedAt = new Date();
    await collections().chatSessions.replaceOne({ _id: session._id }, session);

    return session.lastTurn.type === "tool_calls"
      ? { type: "tool_calls", sessionId: session._id.toHexString(), calls: session.lastTurn.calls, usage }
      : { type: "final", sessionId: session._id.toHexString(), content: session.lastTurn.content, usage };
  } catch (error) {
    logFailure("start", input.requestId, error);
    await refundUsage(auth.user._id, cost);
    await collections().chatSessions.updateOne(
      { _id: session._id },
      { $set: { status: "failed", updatedAt: new Date() } }
    );
    throw new AppError(
      502,
      error instanceof GatewayTimeoutError ? "initial_timeout" : "ai_service_error",
      error instanceof GatewayTimeoutError
        ? "The request timed out before a response was ready. Reserved usage was returned."
        : "The model service could not complete the request. Reserved usage was returned."
    );
  }
}

export async function continueChat(
  auth: RequestAuth,
  input: {
    sessionId: string;
    results: Array<{ toolCallId: string; name: string; ok: boolean; output: string }>;
    requestId: string;
  }
): Promise<ChatTurn> {
  if (!ObjectId.isValid(input.sessionId)) throw new AppError(400, "invalid_session", "Chat session is invalid.");
  const sessionId = new ObjectId(input.sessionId);
  let session = await collections().chatSessions.findOne({
    _id: sessionId,
    userId: auth.user._id,
    deviceId: auth.device._id
  });
  if (!session) throw new AppError(404, "session_not_found", "Chat session not found.");
  if (session.lastContinuationId === input.requestId) return toTurn(session);
  if (session.status !== "active") throw new AppError(409, "session_not_active", "Chat session is no longer active.");
  if (session.loopCount > 8) throw new AppError(409, "tool_loop_limit", "Tool loop limit reached after 8 rounds.");

  const expected = new Set(session.pendingToolCallIds);
  if (input.results.length !== expected.size || input.results.some((result) => !expected.has(result.toolCallId))) {
    throw new AppError(409, "tool_result_mismatch", "Tool results do not match the pending calls.");
  }

  const lock = await collections().chatSessions.updateOne(
    {
      _id: sessionId,
      status: "active",
      processingContinuationId: { $exists: false },
      lastContinuationId: { $ne: input.requestId }
    },
    { $set: { processingContinuationId: input.requestId, updatedAt: new Date() } }
  );
  if (lock.modifiedCount !== 1) {
    session = await collections().chatSessions.findOne({ _id: sessionId });
    if (session?.lastContinuationId === input.requestId) return toTurn(session);
    throw new AppError(409, "request_in_progress", "This tool review request is already being processed.");
  }

  const reviewMessages = [...session.messages];
  for (const result of input.results) {
    reviewMessages.push({
      role: "tool",
      tool_call_id: result.toolCallId,
      content: JSON.stringify({ ok: result.ok, tool: result.name, output: result.output })
    });
  }

  try {
    const result = await callModelGateway({
      messages: reviewMessages,
      ...(session.loopCount < 8 ? { tools: codingTools } : {}),
      phase: "review"
    });
    if (session.loopCount >= 8 && result.toolCalls.length > 0) {
      throw new Error("Model returned tools after the tool-loop limit.");
    }
    const nextTurn = storedTurn(result);
    const nextStatus = result.toolCalls.length > 0 ? "active" : "completed";
    const nextMessages = [...reviewMessages, result.message];
    await collections().chatSessions.updateOne(
      { _id: sessionId, processingContinuationId: input.requestId },
      {
        $set: {
          messages: nextMessages,
          pendingToolCallIds: result.toolCalls.map((call) => call.id),
          loopCount: session.loopCount + (result.toolCalls.length > 0 ? 1 : 0),
          lastTurn: nextTurn,
          lastContinuationId: input.requestId,
          status: nextStatus,
          updatedAt: new Date()
        },
        $unset: { processingContinuationId: "" }
      }
    );
    const usage = await usageView(auth.user._id, auth.user.plan);
    return nextTurn.type === "tool_calls"
      ? { type: "tool_calls", sessionId: input.sessionId, calls: nextTurn.calls, usage }
      : { type: "final", sessionId: input.sessionId, content: nextTurn.content, usage };
  } catch (error) {
    logFailure("review", input.requestId, error);
    await collections().chatSessions.updateOne(
      { _id: sessionId, processingContinuationId: input.requestId },
      {
        $set: {
          status: error instanceof GatewayTimeoutError ? "active" : "failed",
          updatedAt: new Date()
        },
        $unset: { processingContinuationId: "" }
      }
    );
    throw new AppError(
      502,
      error instanceof GatewayTimeoutError ? "review_timeout" : "ai_service_error",
      error instanceof GatewayTimeoutError
        ? "Final review timed out after local tool execution."
        : "The model service could not review the local tool results."
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
  const requestId = new ObjectId().toHexString();
  try {
    const result = await callModelGateway({
      phase: "simple",
      messages: [
        { role: "system", content: config.corePrompt },
        { role: "system", content: config.strummerPrompt },
        { role: "system", content: `Relevant account memory:\n${memory}` },
        { role: "user", content: message }
      ]
    });
    return { content: result.content || "No response.", usage };
  } catch (error) {
    logFailure("playground", requestId, error);
    await refundUsage(auth.userId, cost);
    throw new AppError(502, "ai_service_error", "The model service is temporarily unavailable.");
  }
}
