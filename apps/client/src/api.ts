import type { ClientConfig, StoredAuth, ChatResponse, ToolExecutionResult, UsageInfo, TaskChange } from "./types.js";
import { createNonce, signRequest, stableStringify } from "./crypto.js";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

type FetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signed?: boolean;
  timeoutMs?: number;
};

export class VinnexxApi {
  constructor(
    private readonly config: ClientConfig,
    private auth: StoredAuth | null
  ) {}

  setAuth(auth: StoredAuth | null): void {
    this.auth = auth;
  }

  async request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const bodyText = options.body === undefined ? undefined : JSON.stringify(options.body);			
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Vinnexx-Version": "0.2.0"
    };
    if (bodyText !== undefined) headers["Content-Type"] = "application/json";

    const requestUrl = new URL(`${this.config.serverBaseUrl}${path}`);

    if (options.signed) {
      if (!this.auth) throw new ApiError("You are not logged in.", 401, "not_authenticated");
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = createNonce();
      const canonicalPath = `${requestUrl.pathname}${requestUrl.search}`;
      headers.Authorization = `Bearer ${this.auth.deviceToken}`;
      headers["X-Vinnexx-Timestamp"] = timestamp;
      headers["X-Vinnexx-Nonce"] = nonce;
      headers["X-Vinnexx-Signature"] = signRequest({
        secret: this.auth.signingSecret,
        method,
        path: canonicalPath,
        timestamp,
        nonce,
        body: options.body
      });
    }

    let response: Response;
    try {
      const requestInit: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
        ...(bodyText === undefined ? {} : { body: bodyText })
      };
      response = await fetch(requestUrl, requestInit);
    } catch (error) {
  const timedOut =
    error instanceof Error &&
    (
      error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      error.message.toLowerCase().includes("timeout")
    );

  if (timedOut) {
    throw new ApiError(
      `Vinnexx server did not respond within ${Math.round(
        (options.timeoutMs ?? 90_000) / 1000
      )} seconds.`,
      0,
      "request_timeout"
    );
  }

  throw new ApiError(
    `Cannot reach Vinnexx server: ${
      error instanceof Error ? error.message : String(error)
    }`,
    0,
    "network_error"
  );
}

    const payload = (await response.json().catch(() => ({
      error: { message: `Server returned HTTP ${response.status}.` }
    }))) as {
      data?: T;
      error?: { code?: string; message?: string; details?: unknown };
    };
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

  startDeviceAuth(deviceName: string, platform: string): Promise<{
    deviceCode: string;
    pollSecret: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
  }> {
    return this.request("/device/start", {
      method: "POST",
      body: { deviceName, platform }
    });
  }

  pollDeviceAuth(deviceCode: string, pollSecret: string): Promise<
    | { status: "pending" | "denied" | "expired" }
    | { status: "approved"; credentials: StoredAuth }
  > {
    return this.request("/device/status", {
      method: "POST",
      body: { deviceCode, pollSecret }
    });
  }

  getAccount(): Promise<StoredAuth["account"]> {
    return this.request("/cli/account", { signed: true });
  }

  getUsage(): Promise<UsageInfo> {
    return this.request("/cli/usage", { signed: true });
  }

  startChat(message: string, workspaceTree: string): Promise<ChatResponse> {
  return this.request("/cli/chat/start", {
    method: "POST",
    signed: true,
    timeoutMs: 90_000,
    body: {
      message,
      workspaceTree,
      language: this.config.language
    }
  });
}

  continueChat(
  sessionId: string,
  results: ToolExecutionResult[]
): Promise<ChatResponse> {
  return this.request("/cli/chat/tool-result", {
    method: "POST",
    signed: true,
    timeoutMs: 60_000,
    body: {
      sessionId,
      results
    }
  });
}

  completeTask(input: {
    sessionId: string;
    prompt: string;
    finalAnswer: string;
    changes: TaskChange[];
    commands: string[];
  }): Promise<{ saved: boolean }> {
    return this.request("/cli/task/complete", {
      method: "POST",
      signed: true,
      body: input
    });
  }

  listMemories(): Promise<Array<{ key: string; value: string; updatedAt: string }>> {
    return this.request("/cli/memory", { signed: true });
  }

  upsertMemory(key: string, value: string): Promise<{ key: string; value: string }> {
    return this.request("/cli/memory", {
      method: "PUT",
      signed: true,
      body: { key, value }
    });
  }

  revokeCurrentDevice(): Promise<{ revoked: boolean }> {
    return this.request("/cli/device/logout", { method: "POST", signed: true, body: {} });
  }
}
