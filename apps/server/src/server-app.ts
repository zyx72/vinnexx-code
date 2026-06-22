import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { env } from "./env.js";
import { AppError } from "./http.js";
import { publicRoutes } from "./routes/public.js";
import { authRoutes } from "./routes/auth.js";
import { deviceRoutes } from "./routes/device.js";
import { cliRoutes } from "./routes/cli.js";
import { accountRoutes } from "./routes/account.js";
import { playgroundRoutes } from "./routes/playground.js";
import { adminRoutes } from "./routes/admin.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.x-vinnexx-signature",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "body.password",
          "body.deviceToken",
          "body.signingSecret",
          "body.pollSecret"
        ],
        censor: "[REDACTED]"
      }
    },
    bodyLimit: 1_000_000,
    trustProxy: env.NODE_ENV === "production"
  });

  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || origin === env.PUBLIC_SITE_URL) callback(null, true);
      else callback(new Error("Origin not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" }
  });
  await app.register(rateLimit, {
    global: true,
    max: 180,
    timeWindow: "1 minute",
    ban: 3,
    keyGenerator: (request) => request.ip
  });

  app.get("/", async () => ({ service: "Vinnexx Server", version: "0.2.0" }));
  await app.register(publicRoutes, { prefix: "/api/v1" });
  await app.register(authRoutes, { prefix: "/api/v1" });
  await app.register(deviceRoutes, { prefix: "/api/v1" });
  await app.register(cliRoutes, { prefix: "/api/v1" });
  await app.register(accountRoutes, { prefix: "/api/v1" });
  await app.register(playgroundRoutes, { prefix: "/api/v1" });
  await app.register(adminRoutes, { prefix: "/api/v1" });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details })
        }
      });
    }
    if (error instanceof ZodError) {
  return reply.code(400).send({
    error: {
      code: "validation_error",
      message: error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; "),
      details: error.flatten()
    }
  });
}
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 429) {
      return reply.code(429).send({
        error: { code: "rate_limited", message: "Too many requests. Try again later." }
      });
    }
    request.log.error({ err: error }, "Unhandled request error");
    return reply.code(500).send({
      error: { code: "internal_error", message: "An internal server error occurred." }
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: { code: "not_found", message: "Endpoint not found." }
    });
  });

  return app;
}
