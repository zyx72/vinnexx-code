import { env } from "../env.js";
import type { ProviderMessage } from "../types.js";

export type NormalizedAssistant = {
  message: ProviderMessage;
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
};

type OpenRouterToolCall = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
};

type OpenRouterResponse = {
  id?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: OpenRouterToolCall[];
    };
    error?: {
      code?: number;
      message?: string;
      metadata?: Record<string, unknown>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    metadata?: Record<string, unknown>;
  };
};

function parseArguments(value: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value;

  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // invalid tool args become empty object
  }

  return {};
}

function normalizeMessages(messages: ProviderMessage[]): ProviderMessage[] {
  return messages.map((message): ProviderMessage => {
    const originalContent =
      typeof message.content === "string" ? message.content : "";

    const content =
      message.role === "tool" && originalContent.length > 30_000
        ? `${originalContent.slice(0, 30_000)}\n… tool output truncated by Vinnexx …`
        : originalContent;

    return {
      ...message,
      content
    };
  });
}

export async function callOpenRouter(input: {
  messages: ProviderMessage[];
  model: string;
  tools?: readonly unknown[];
}): Promise<NormalizedAssistant> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.PUBLIC_SITE_URL,
        "X-OpenRouter-Title": "Vinnexx Code"
      },
      body: JSON.stringify({
        model: input.model,
        messages: normalizeMessages(input.messages),
        stream: false,
        temperature: 0.2,
        max_tokens: 2048,
        ...(input.tools
          ? {
              tools: input.tools,
              tool_choice: "auto"
            }
          : {})
      })
    });

    const rawText = await response.text();
    let data: OpenRouterResponse;

    try {
      data = JSON.parse(rawText) as OpenRouterResponse;
    } catch {
      throw new Error(`OpenRouter returned invalid JSON (${response.status}): ${rawText.slice(0, 500)}`);
    }

    if (!response.ok) {
      throw new Error(
        data.error?.message ??
          `OpenRouter request failed with HTTP ${response.status}: ${rawText.slice(0, 500)}`
      );
    }

    if (data.error) {
      throw new Error(data.error.message ?? "OpenRouter provider error.");
    }

    const choice = data.choices?.[0];
    if (!choice?.message) {
      throw new Error(`OpenRouter returned no assistant message: ${rawText.slice(0, 500)}`);
    }

    if (choice.error) {
      throw new Error(choice.error.message ?? "OpenRouter completion error.");
    }

    const rawToolCalls = Array.isArray(choice.message.tool_calls)
      ? choice.message.tool_calls
      : [];

    const toolCalls = rawToolCalls.map((call, index) => ({
      id: call.id ?? `tool_${Date.now()}_${index}`,
      name: call.function?.name ?? "unknown_tool",
      arguments: parseArguments(call.function?.arguments)
    }));

    const content = typeof choice.message.content === "string" ? choice.message.content : "";

    const message: ProviderMessage = {
      role: "assistant",
      content,
      ...(toolCalls.length > 0
        ? {
            tool_calls: toolCalls.map((call) => ({
              id: call.id,
              type: "function" as const,
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments)
              }
            }))
          }
        : {})
    };

    return { message, content, toolCalls };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenRouter request timed out after 60 seconds.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
