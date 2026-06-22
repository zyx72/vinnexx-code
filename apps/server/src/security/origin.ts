import type { FastifyRequest } from "fastify";
import { env } from "../env.js";
import { AppError } from "../http.js";

export async function requireTrustedOrigin(request: FastifyRequest): Promise<void> {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.origin;
  if (!origin || origin !== env.PUBLIC_SITE_URL) {
    throw new AppError(403, "invalid_origin", "Request origin is not allowed.");
  }
}
