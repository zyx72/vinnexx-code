export type StoredAuth = {
  deviceId: string;
  deviceToken: string;
  signingSecret: string;
  account: {
    id: string;
    username: string;
    email: string;
    plan: string;
  };
};

export type ClientConfig = {
  serverBaseUrl: string;
  trustedWorkspaces: string[];
  language: "en" | "id";
  rootDir?: string;
  workspace?: string;
  theme?: "cyber" | "minimal";
  clearOnStart?: boolean;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatResponse =
  | {
      type: "final";
      sessionId: string;
      content: string;
      usage: UsageInfo;
    }
  | {
      type: "tool_calls";
      sessionId: string;
      calls: ToolCall[];
      usage: UsageInfo;
    };

export type UsageInfo = {
  plan: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  resetAt: string;
};

export type ToolExecutionResult = {
  toolCallId: string;
  name: string;
  ok: boolean;
  output: string;
};

export type TaskChange = {
  path: string;
  kind: "created" | "edited" | "deleted";
};
