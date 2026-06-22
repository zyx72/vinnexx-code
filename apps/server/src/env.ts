import "dotenv/config";
import { z } from "zod";

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
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z
  .string()
  .min(1)
  .default("nvidia/nemotron-3-ultra-550b-a55b:free"),
  OPENROUTER_BASE_URL: z
  .string()
  .url()
  .default("https://openrouter.ai/api/v1"),
  ADMIN_EMAILS: z.string().default(""),
  FREE_HOURLY_TOKENS: z.coerce.number().int().positive().default(1000),
  CHARACTERS_PER_TOKEN: z.coerce.number().int().positive().default(5)
});

const normalizedEnvironment = {
  ...process.env,
  NODE_ENV:
    process.env.NODE_ENV ??
    (process.env.VERCEL === "1" || process.env.VERCEL === "true" ? "production" : "development")
};

export const env = schema.parse(normalizedEnvironment);

export const adminEmails = new Set(
  env.ADMIN_EMAILS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

export function deviceEncryptionKey(): Buffer {
  const key = Buffer.from(env.DEVICE_SECRET_ENCRYPTION_KEY, "base64url");
  if (key.length !== 32) {
    throw new Error("DEVICE_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}
