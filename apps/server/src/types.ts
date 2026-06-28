import type { ObjectId } from "mongodb";

export type Plan = "free" | "pro";
export type Role = "user" | "admin";
export type PublicMode = "strummer" | "united";

export type UserDoc = {
  _id: ObjectId;
  email: string;
  username: string;
  passwordHash: string;
  plan: Plan;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
};

export type WebSessionDoc = { _id: ObjectId; tokenHash: string; userId: ObjectId; expiresAt: Date; createdAt: Date };
export type DeviceDoc = {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  platform: string;
  tokenHash: string;
  signingSecretEncrypted: string;
  active: boolean;
  createdAt: Date;
  lastSeenAt: Date;
};
export type DeviceAuthSessionDoc = {
  _id: ObjectId;
  deviceCodeHash: string;
  pollSecretHash: string;
  userCode: string;
  deviceName: string;
  platform: string;
  status: "pending" | "approved" | "denied";
  userId?: ObjectId;
  credentialsEncrypted?: string;
  createdAt: Date;
  expiresAt: Date;
  approvedAt?: Date;
  deliveredAt?: Date;
  approvalLock?: string;
};
export type NonceDoc = { _id: ObjectId; deviceId: ObjectId; nonce: string; expiresAt: Date };
export type UsageWindowDoc = {
  _id: ObjectId;
  userId: ObjectId;
  bucketStart: Date;
  used: number;
  limit: number;
  createdAt: Date;
  updatedAt: Date;
};
export type MemoryDoc = {
  _id: ObjectId;
  userId: ObjectId;
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
};

export type GatewayMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type StoredTurn =
  | { type: "final"; content: string }
  | { type: "tool_calls"; calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> };

export type ChatSessionDoc = {
  _id: ObjectId;
  userId: ObjectId;
  deviceId: ObjectId;
  requestId: string;
  publicMode: PublicMode;
  messages: GatewayMessage[];
  pendingToolCallIds: string[];
  loopCount: number;
  lastTurn: StoredTurn;
  lastContinuationId?: string;
  processingContinuationId?: string;
  status: "active" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
};

export type SummaryDoc = {
  _id: ObjectId;
  userId: ObjectId;
  deviceId: ObjectId;
  sessionId: ObjectId;
  prompt: string;
  finalAnswer: string;
  changes: Array<{ path: string; kind: "created" | "edited" | "deleted" }>;
  commands: string[];
  createdAt: Date;
};

export type SystemConfigDoc = {
  _id: "ai";
  promptVersion: 3;
  corePrompt: string;
  strummerPrompt: string;
  unitedPrompt: string;
  updatedAt: Date;
};

export type RequestAuth = { user: UserDoc; device: DeviceDoc };

declare module "fastify" {
  interface FastifyRequest {
    deviceAuth?: RequestAuth;
    webUser?: UserDoc;
  }
}
