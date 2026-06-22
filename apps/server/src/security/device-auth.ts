import type { FastifyRequest } from "fastify";
import { ObjectId } from "mongodb";
import { collections } from "../db.js";
import { deviceEncryptionKey } from "../env.js";
import { AppError } from "../http.js";
import {
  constantTimeEqual,
  decryptJson,
  requestSignature,
  sha256
} from "./crypto.js";

function header(request: FastifyRequest, name: string): string {
  const value = request.headers[name.toLowerCase()];
  if (typeof value !== "string" || !value) {
    throw new AppError(401, "missing_security_header", `Missing ${name}.`);
  }
  return value;
}

export async function requireDeviceAuth(request: FastifyRequest): Promise<void> {
  const authorization = header(request, "Authorization");
  if (!authorization.startsWith("Bearer ")) {
    throw new AppError(401, "invalid_authorization", "Invalid authorization header.");
  }
  const token = authorization.slice(7);
  const timestamp = header(request, "X-Vinnexx-Timestamp");
  const nonce = header(request, "X-Vinnexx-Nonce");
  const signature = header(request, "X-Vinnexx-Signature");

  const timestampNumber = Number(timestamp);
  if (!Number.isInteger(timestampNumber)) {
    throw new AppError(401, "invalid_timestamp", "Request timestamp is invalid.");
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 60) {
    throw new AppError(401, "expired_request", "Request timestamp is outside the accepted window.");
  }
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(nonce)) {
    throw new AppError(401, "invalid_nonce", "Request nonce is invalid.");
  }

  const device = await collections().devices.findOne({
    tokenHash: sha256(token),
    active: true
  });
  if (!device) throw new AppError(401, "invalid_device", "Device session is invalid.");

  const secret = decryptJson<{ signingSecret: string }>(
    device.signingSecretEncrypted,
    deviceEncryptionKey()
  ).signingSecret;
  const expected = requestSignature({
    secret,
    method: request.method,
    path: (() => {
  const url = new URL(request.raw.url ?? request.url, "http://localhost");
  url.searchParams.delete("path");
  return `${url.pathname}${url.search}`;
})(),
    timestamp,
    nonce,
    body: request.body
  });
  if (!constantTimeEqual(expected, signature)) {
    throw new AppError(401, "invalid_signature", "Request signature is invalid.");
  }

  try {
    await collections().nonces.insertOne({
      _id: new ObjectId(),
      deviceId: device._id,
      nonce,
      expiresAt: new Date(Date.now() + 5 * 60_000)
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new AppError(409, "replay_detected", "This request nonce was already used.");
    }
    throw error;
  }

  const user = await collections().users.findOne({ _id: device.userId });
  if (!user) throw new AppError(401, "account_missing", "The linked account no longer exists.");
  request.deviceAuth = { user, device };
  void collections().devices.updateOne(
    { _id: device._id },
    { $set: { lastSeenAt: new Date() } }
  );
}
