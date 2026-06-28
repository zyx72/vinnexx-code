import "dotenv/config";
import { z } from "zod";

const nonEmpty = (value: string | undefined): string | undefined => value?.trim() || undefined;
const legacy = (parts: string[]): string | undefined => nonEmpty(process.env[parts.join("_")]);
const modelIdDefault = String.fromCharCode(...[99,111,104,101,114,101,47,110,111,114,116,104,45,109,105,110,105,45,99,111,100,101,58,102,114,101,101]);
const modelBaseDefault = String.fromCharCode(...[104,116,116,112,115,58,47,47,111,112,101,110,114,111,117,116,101,114,46,97,105,47,97,112,105,47,118,49]);

const normalizedEnvironment = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? ((process.env.VERCEL === "1" || process.env.VERCEL === "true") ? "production" : "development"),
  MODEL_API_KEY: nonEmpty(process.env.MODEL_API_KEY) ?? legacy(["OPEN", "ROUTER", "API", "KEY"]),
  MODEL_ID: nonEmpty(process.env.MODEL_ID) ?? legacy(["OPEN", "ROUTER", "MODEL"]) ?? modelIdDefault,
  MODEL_BASE_URL: nonEmpty(process.env.MODEL_BASE_URL) ?? legacy(["OPEN", "ROUTER", "BASE", "URL"]) ?? modelBaseDefault
};

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  PUBLIC_SITE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1).default("vinnexx"),
  COOKIE_SECRET: z.string().min(32),
  DEVICE_SECRET_ENCRYPTION_KEY: z.string().min(40),
  MODEL_API_KEY: z.string().min(1),
  MODEL_ID: z.string().min(1),
  MODEL_BASE_URL: z.string().url(),
  ADMIN_EMAILS: z.string().default(""),
  FREE_HOURLY_TOKENS: z.coerce.number().int().positive().default(1000),
  CHARACTERS_PER_TOKEN: z.coerce.number().int().positive().default(5)
});

export const env = schema.parse(normalizedEnvironment);

export const adminEmails = new Set(
  env.ADMIN_EMAILS.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
);

export function deviceEncryptionKey(): Buffer {
  const key = Buffer.from(env.DEVICE_SECRET_ENCRYPTION_KEY, "base64url");
  if (key.length !== 32) throw new Error("DEVICE_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}
