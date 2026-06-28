import type {
  Account,
  ChatResponse,
  PublicModel,
  StoredAuth,
  TaskChange,
  ToolExecutionResult,
  UsageInfo
} from "./types.js";
import { createNonce, signRequest } from "./crypto.js";

const VERSION = "0.3.0";
const DEFAULT_ENDPOINT_BYTES = [
  104,116,116,112,115,58,47,47,118,105,110,110,101,120,120,45,115,101,114,118,101,114,46,118,101,114,99,101,108,46,97,112,112,47,97,112,105,47,118,49
];

function endpoint(): string {
  return (process.env.VINNEXX_API_URL ?? String.fromCharCode(...DEFAULT_ENDPOINT_BYTES)).replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type FetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signed?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  requestId?: string;
};

function mergedSignal(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const abort = () => controller.abort(external?.reason ?? new DOMException("Cancelled", "AbortError"));
  if (external?.aborted) abort();
  else external?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", abort);
    }
  };
}

function safeNetworkMessage(error: unknown, timeoutMs: number): ApiError {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError") {
    return new ApiError(
      `Vinnexx did not respond within ${Math.round(timeoutMs / 1000)} seconds.`,
      0,
      "request_timeout"
    );
  }
  if (name === "AbortError") return new ApiError("Request cancelled.", 0, "request_cancelled");
  return new ApiError("Cannot reach the Vinnexx service.", 0, "network_error");
}

export class VinnexxApi {
  private auth: StoredAuth | null;

  constructor(auth: StoredAuth | null) {
    this.auth = auth;
  }

  setAuth(auth: StoredAuth | null): void {
    this.auth = auth;
  }

  async request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const timeoutMs = options.timeoutMs ?? 55_000;
    const bodyText = options.body === undefined ? undefined : JSON.stringify(options.body);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Vinnexx-Version": VERSION
    };
    if (bodyText !== undefined) headers["Content-Type"] = "application/json";
    if (options.requestId) headers["X-Vinnexx-Request-Id"] = options.requestId;

    const requestUrl = new URL(`${endpoint()}${path}`);
    if (options.signed) {
      if (!this.auth) throw new ApiError("You are not logged in.", 401, "not_authenticated");
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = createNonce();
      headers.Authorization = `Bearer ${this.auth.deviceToken}`;
      headers["X-Vinnexx-Timestamp"] = timestamp;
      headers["X-Vinnexx-Nonce"] = nonce;
      headers["X-Vinnexx-Signature"] = signRequest({
        secret: this.auth.signingSecret,
        method,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        timestamp,
        nonce,
        body: options.body
      });
    }

    const combined = mergedSignal(timeoutMs, options.signal);
    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method,
        headers,
        signal: combined.signal,
        ...(bodyText === undefined ? {} : { body: bodyText })
      });
    } catch (error) {
      throw safeNetworkMessage(error, timeoutMs);
    } finally {
      combined.cleanup();
    }

    const payload = (await response.json().catch(() => ({
      error: { message: `Service returned HTTP ${response.status}.` }
    }))) as { data?: T; error?: { code?: string; message?: string; details?: unknown } };

    if (!response.ok || payload.error) {
      throw new ApiError(
        payload.error?.message ?? `Request failed with HTTP ${response.status}.`,
        response.status,
        payload.error?.code,
        payload.error?.details
      );
    }
    return payload.data as T;
  }

  startDeviceAuth(deviceName: string, platform: string, signal?: AbortSignal): Promise<{
    deviceCode: string;
    pollSecret: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
  }> {
    return this.request("/device/start", { method: "POST", body: { deviceName, platform }, ...(signal ? { signal } : {}) });
  }

  pollDeviceAuth(deviceCode: string, pollSecret: string, signal?: AbortSignal): Promise<
    | { status: "pending" | "denied" | "expired" }
    | { status: "approved"; credentials: StoredAuth }
  > {
    return this.request("/device/status", {
      method: "POST",
      body: { deviceCode, pollSecret },
      ...(signal ? { signal } : {})
    });
  }

  getAccount(signal?: AbortSignal): Promise<Account> {
    return this.request("/cli/account", { signed: true, ...(signal ? { signal } : {}) });
  }

  getUsage(signal?: AbortSignal): Promise<UsageInfo> {
    return this.request("/cli/usage", { signed: true, ...(signal ? { signal } : {}) });
  }

  startChat(input: {
    message: string;
    workspaceTree: string;
    language: "en" | "id";
    publicMode: PublicModel;
    requestId: string;
    signal?: AbortSignal;
  }): Promise<ChatResponse> {
    return this.request("/cli/chat/start", {
      method: "POST",
      signed: true,
      timeoutMs: 58_000,
      ...(input.signal ? { signal: input.signal } : {}),
      requestId: input.requestId,
      body: {
        message: input.message,
        workspaceTree: input.workspaceTree,
        language: input.language,
        publicMode: input.publicMode,
        requestId: input.requestId
      }
    });
  }

  continueChat(input: {
    sessionId: string;
    results: ToolExecutionResult[];
    requestId: string;
    signal?: AbortSignal;
  }): Promise<ChatResponse> {
    return this.request("/cli/chat/tool-result", {
      method: "POST",
      signed: true,
      timeoutMs: 58_000,
      ...(input.signal ? { signal: input.signal } : {}),
      requestId: input.requestId,
      body: input
    });
  }

  completeTask(input: {
    sessionId: string;
    prompt: string;
    finalAnswer: string;
    changes: TaskChange[];
    commands: string[];
  }): Promise<{ saved: boolean }> {
    return this.request("/cli/task/complete", { method: "POST", signed: true, body: input });
  }

  listMemories(): Promise<Array<{ key: string; value: string; updatedAt: string }>> {
    return this.request("/cli/memory", { signed: true });
  }

  upsertMemory(key: string, value: string): Promise<{ key: string; value: string }> {
    return this.request("/cli/memory", { method: "PUT", signed: true, body: { key, value } });
  }

  revokeCurrentDevice(): Promise<{ revoked: boolean }> {
    return this.request("/cli/device/logout", { method: "POST", signed: true, body: {} });
  }
}
