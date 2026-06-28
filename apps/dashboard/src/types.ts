export type User = {
  id: string;
  email: string;
  username: string;
  plan: "free" | "pro";
  role: "user" | "admin";
  createdAt: string;
};

export type Usage = {
  plan: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  resetAt: string;
};

export type Device = {
  id: string;
  name: string;
  platform: string;
  active: boolean;
  createdAt: string;
  lastSeenAt: string;
};

export type MemoryItem = {
  key: string;
  value: string;
  updatedAt: string;
};

export type Summary = {
  id: string;
  prompt: string;
  finalAnswer: string;
  changes: Array<{ path: string; kind: "created" | "edited" | "deleted" }>;
  commands: string[];
  createdAt: string;
};
