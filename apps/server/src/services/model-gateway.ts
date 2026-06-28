import { env } from "../env.js";
import type { GatewayMessage } from "../types.js";

export class GatewayTimeoutError extends Error {
  constructor() {
    super("Model request timed out.");
    this.name = "GatewayTimeoutError";
  }
}

export type NormalizedAssistant = {
  message: GatewayMessage;
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
};

type RawToolCall = {
  id?: string;
  function?: { name?: string; arguments?: string | Record<string, unknown> };
};
type RawResponse = {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: RawToolCall[] };
    error?: { message?: string };
  }>;
  error?: { message?: string };
};

function parseArguments(value: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Invalid arguments are rejected later by local validation.
  }
  return {};
}

function truncateToolContent(content: string): string {
  if (content.length <= 30_000) return content;
  return `${content.slice(0, 21_000)}\n… output truncated …\n${content.slice(-8_000)}`;
}

function normalizeMessages(messages: GatewayMessage[]): GatewayMessage[] {
  return messages.map((message) => ({
    ...message,
    content: message.role === "tool" ? truncateToolContent(message.content ?? "") : (message.content ?? "")
  }));
}

export async function callModelGateway(input: {
  messages: GatewayMessage[];
  tools?: readonly unknown[];
  phase: "initial" | "review" | "simple";
}): Promise<NormalizedAssistant> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.phase === "simple" ? 45_000 : 55_000);
  try {
    const response = await fetch(`${env.MODEL_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.MODEL_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.PUBLIC_SITE_URL,
        "X-Title": "Vinnexx Code"
      },
      body: JSON.stringify({
        model: env.MODEL_ID,
        messages: normalizeMessages(input.messages),
        stream: false,
        temperature: input.phase === "review" ? 0.1 : 0.2,
        max_tokens: input.phase === "simple" ? 700 : input.phase === "review" ? 1_200 : 2_200,
        ...(input.tools ? { tools: input.tools, tool_choice: "auto" } : {})
      })
    });

    const raw = await response.text();
    let data: RawResponse;
    try {
      data = JSON.parse(raw) as RawResponse;
    } catch {
      throw new Error("Model service returned an invalid response.");
    }
    if (!response.ok || data.error) throw new Error("Model service request failed.");
    const choice = data.choices?.[0];
    if (!choice?.message || choice.error) throw new Error("Model service returned no assistant message.");

    const toolCalls = (choice.message.tool_calls ?? []).map((call, index) => ({
      id: call.id ?? `tool_${Date.now()}_${index}`,
      name: call.function?.name ?? "unknown_tool",
      arguments: parseArguments(call.function?.arguments)
    }));
    const content = typeof choice.message.content === "string" ? choice.message.content : "";
    const message: GatewayMessage = {
      role: "assistant",
      content,
      ...(toolCalls.length > 0 ? {
        tool_calls: toolCalls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: JSON.stringify(call.arguments) }
        }))
      } : {})
    };
    return { message, content, toolCalls };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new GatewayTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
