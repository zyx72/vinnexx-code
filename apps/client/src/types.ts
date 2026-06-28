export type Account = {
  id: string;
  username: string;
  email: string;
  plan: "free" | "pro";
  deviceStatus?: "active" | "revoked";
};

export type StoredAuth = {
  deviceToken: string;
  signingSecret: string;
  account: Account;
};

export type PublicModel = "strummer" | "united";

export const PUBLIC_MODEL_NAMES: Record<PublicModel, string> = {
  strummer: "Strummer0.5",
  united: "United0.5"
};

export type ClientConfig = {
  trustedWorkspaces: string[];
  language: "en" | "id";
  rootDir: string;
  workspace: string;
  selectedPublicModel: PublicModel;
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
