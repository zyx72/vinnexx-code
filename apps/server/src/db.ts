import { MongoClient, type Collection, type Db } from "mongodb";
import { env } from "./env.js";
import type {
  ChatSessionDoc,
  DeviceAuthSessionDoc,
  DeviceDoc,
  MemoryDoc,
  NonceDoc,
  SummaryDoc,
  SystemConfigDoc,
  UsageWindowDoc,
  UserDoc,
  WebSessionDoc
} from "./types.js";

let client: MongoClient | null = null;
let database: Db | null = null;

export type Collections = {
  users: Collection<UserDoc>;
  webSessions: Collection<WebSessionDoc>;
  devices: Collection<DeviceDoc>;
  deviceAuthSessions: Collection<DeviceAuthSessionDoc>;
  nonces: Collection<NonceDoc>;
  usageWindows: Collection<UsageWindowDoc>;
  memories: Collection<MemoryDoc>;
  chatSessions: Collection<ChatSessionDoc>;
  summaries: Collection<SummaryDoc>;
  systemConfig: Collection<SystemConfigDoc>;
};

let cachedCollections: Collections | null = null;

export async function connectDatabase(): Promise<Db> {
  if (database) return database;
  client = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 10_000
  });
  await client.connect();
  database = client.db(env.MONGODB_DB);
  await ensureIndexes(database);
  return database;
}

export function collections(): Collections {
  if (!database) throw new Error("Database has not been connected.");
  if (cachedCollections) return cachedCollections;
  cachedCollections = {
    users: database.collection<UserDoc>("users"),
    webSessions: database.collection<WebSessionDoc>("web_sessions"),
    devices: database.collection<DeviceDoc>("devices"),
    deviceAuthSessions: database.collection<DeviceAuthSessionDoc>("device_auth_sessions"),
    nonces: database.collection<NonceDoc>("nonces"),
    usageWindows: database.collection<UsageWindowDoc>("usage_windows"),
    memories: database.collection<MemoryDoc>("memories"),
    chatSessions: database.collection<ChatSessionDoc>("chat_sessions"),
    summaries: database.collection<SummaryDoc>("summaries"),
    systemConfig: database.collection<SystemConfigDoc>("system_config")
  };
  return cachedCollections;
}

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db.collection("web_sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("web_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("devices").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("devices").createIndex({ userId: 1, active: 1 }),
    db.collection("device_auth_sessions").createIndex({ deviceCodeHash: 1 }, { unique: true }),
    db.collection("device_auth_sessions").createIndex({ userCode: 1 }, { unique: true }),
    db.collection("device_auth_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("nonces").createIndex({ deviceId: 1, nonce: 1 }, { unique: true }),
    db.collection("nonces").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("usage_windows").createIndex({ userId: 1, bucketStart: 1 }, { unique: true }),
    db.collection("memories").createIndex({ userId: 1, key: 1 }, { unique: true }),
    db.collection("chat_sessions").createIndex({ userId: 1, updatedAt: -1 }),
    db.collection("summaries").createIndex({ userId: 1, createdAt: -1 })
  ]);
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = null;
  database = null;
  cachedCollections = null;
}
