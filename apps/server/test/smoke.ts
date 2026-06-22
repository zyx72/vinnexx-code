process.env.NODE_ENV = "test";
process.env.PUBLIC_SITE_URL = "http://localhost:4173";
process.env.API_BASE_URL = "http://localhost:8787/api/v1";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/vinnexx_test";
process.env.MONGODB_DB = "vinnexx_test";
process.env.COOKIE_SECRET = "c".repeat(64);
process.env.DEVICE_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
process.env.OPENROUTER_API_KEY = "test-key";
process.env.OPENROUTER_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
process.env.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
process.env.ADMIN_EMAILS = "admin@example.com";

const { buildApp } = await import("../src/server-app.js");
const app = await buildApp();

const health = await app.inject({ method: "GET", url: "/api/v1/health" });
if (health.statusCode !== 200) {
  throw new Error(`Health endpoint failed: ${health.statusCode} ${health.body}`);
}
const body = health.json();
if (body?.data?.version !== "0.2.0") {
  throw new Error(`Unexpected health payload: ${health.body}`);
}

const missing = await app.inject({ method: "GET", url: "/api/v1/not-real" });
if (missing.statusCode !== 404) {
  throw new Error(`Not-found handler failed: ${missing.statusCode}`);
}

await app.close();
console.log("Server smoke test passed.");
