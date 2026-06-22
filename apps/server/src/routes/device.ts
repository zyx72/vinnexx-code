import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "../db.js";
import { deviceEncryptionKey, env } from "../env.js";
import { AppError, ok } from "../http.js";
import {
  decryptJson,
  encryptJson,
  randomToken,
  sha256
} from "../security/crypto.js";
import { requireTrustedOrigin } from "../security/origin.js";
import { requireWebAuth, parseObjectId } from "../security/web-auth.js";
import type { StoredAuthPayload } from "./route-types.js";

const startSchema = z.object({
  deviceName: z.string().trim().min(1).max(120),
  platform: z.string().trim().min(1).max(80)
});
const statusSchema = z.object({
  deviceCode: z.string().min(20).max(200),
  pollSecret: z.string().min(20).max(200)
});
const approveSchema = z.object({ userCode: z.string().trim().min(6).max(20) });
const inspectSchema = z.object({ id: z.string().trim().min(6).max(20) });
const revokeSchema = z.object({ deviceId: z.string() });

function createUserCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = Buffer.from(randomToken(8));
  let result = "";
  for (let index = 0; index < 8; index += 1) {
    result += alphabet[bytes[index]! % alphabet.length];
  }
  return result;
}

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/device/start",
    { config: { rateLimit: { max: 60, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const body = startSchema.parse(request.body);
      const deviceCode = randomToken(32);
      const pollSecret = randomToken(32);
      let userCode = createUserCode();
      while (await collections().deviceAuthSessions.findOne({ userCode })) userCode = createUserCode();
      const now = new Date();
      await collections().deviceAuthSessions.insertOne({
        _id: new ObjectId(),
        deviceCodeHash: sha256(deviceCode),
        pollSecretHash: sha256(pollSecret),
        userCode,
        deviceName: body.deviceName,
        platform: body.platform,
        status: "pending",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 10 * 60_000)
      });
      return ok(reply, {
        deviceCode,
        pollSecret,
        userCode,
        verificationUri: `${env.PUBLIC_SITE_URL}/auth?id=${encodeURIComponent(userCode)}`,
        expiresIn: 600,
        interval: 2
      }, 201);
    }
  );

  app.post(
    "/device/status",
    { config: { rateLimit: { max: 180, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const body = statusSchema.parse(request.body);
      const session = await collections().deviceAuthSessions.findOne({
        deviceCodeHash: sha256(body.deviceCode),
        pollSecretHash: sha256(body.pollSecret)
      });
      if (!session || session.expiresAt <= new Date()) return ok(reply, { status: "expired" as const });
      if (session.status === "pending") return ok(reply, { status: "pending" as const });
      if (session.status === "denied") return ok(reply, { status: "denied" as const });
      if (!session.credentialsEncrypted) {
        throw new AppError(500, "credentials_missing", "Approved device credentials are unavailable.");
      }
      const credentials = decryptJson<StoredAuthPayload>(
        session.credentialsEncrypted,
        deviceEncryptionKey()
      );
      await collections().deviceAuthSessions.updateOne(
        { _id: session._id },
        { $set: { deliveredAt: new Date() } }
      );
      return ok(reply, { status: "approved" as const, credentials });
    }
  );

  app.get("/device/inspect", async (request, reply) => {
    const query = inspectSchema.parse(request.query);
    const session = await collections().deviceAuthSessions.findOne({ userCode: query.id.toUpperCase() });
    if (!session || session.expiresAt <= new Date()) {
      throw new AppError(404, "connection_not_found", "Connection request was not found or expired.");
    }
    return ok(reply, {
      userCode: session.userCode,
      deviceName: session.deviceName,
      platform: session.platform,
      status: session.status,
      expiresAt: session.expiresAt.toISOString()
    });
  });

  app.post(
    "/device/approve",
    { preHandler: [requireTrustedOrigin, requireWebAuth] },
    async (request, reply) => {
      const body = approveSchema.parse(request.body);
      const approvalLock = randomToken(18);
      const session = await collections().deviceAuthSessions.findOneAndUpdate(
        {
          userCode: body.userCode.toUpperCase(),
          status: "pending",
          expiresAt: { $gt: new Date() },
          approvalLock: { $exists: false }
        },
        { $set: { approvalLock } },
        { returnDocument: "after" }
      );
      if (!session) {
        throw new AppError(404, "connection_not_found", "Connection request was not found, expired, or is already being processed.");
      }

      const user = request.webUser!;
      const deviceToken = randomToken(32);
      const signingSecret = randomToken(32);
      const deviceId = new ObjectId();
      const now = new Date();
      let deviceInserted = false;

      try {
        await collections().devices.insertOne({
          _id: deviceId,
          userId: user._id,
          name: session.deviceName,
          platform: session.platform,
          tokenHash: sha256(deviceToken),
          signingSecretEncrypted: encryptJson({ signingSecret }, deviceEncryptionKey()),
          active: true,
          createdAt: now,
          lastSeenAt: now
        });
        deviceInserted = true;

        const credentials: StoredAuthPayload = {
          deviceId: deviceId.toHexString(),
          deviceToken,
          signingSecret,
          account: {
            id: user._id.toHexString(),
            username: user.username,
            email: user.email,
            plan: user.plan
          }
        };
        const result = await collections().deviceAuthSessions.updateOne(
          { _id: session._id, status: "pending", approvalLock },
          {
            $set: {
              status: "approved",
              userId: user._id,
              approvedAt: now,
              credentialsEncrypted: encryptJson(credentials, deviceEncryptionKey())
            },
            $unset: { approvalLock: "" }
          }
        );
        if (result.modifiedCount !== 1) {
          throw new Error("Device authorization state changed before approval completed.");
        }
        return ok(reply, { approved: true, deviceId: deviceId.toHexString() });
      } catch (error) {
        if (deviceInserted) {
          await collections().devices.updateOne({ _id: deviceId }, { $set: { active: false } });
        }
        await collections().deviceAuthSessions.updateOne(
          { _id: session._id, status: "pending", approvalLock },
          { $unset: { approvalLock: "" } }
        );
        throw error;
      }
    }
  );

  app.post(
    "/device/deny",
    { preHandler: [requireTrustedOrigin, requireWebAuth] },
    async (request, reply) => {
      const body = approveSchema.parse(request.body);
      await collections().deviceAuthSessions.updateOne(
        { userCode: body.userCode.toUpperCase(), status: "pending" },
        { $set: { status: "denied" } }
      );
      return ok(reply, { denied: true });
    }
  );

  app.get("/device/list", { preHandler: [requireWebAuth] }, async (request, reply) => {
    const devices = await collections().devices
      .find({ userId: request.webUser!._id })
      .sort({ lastSeenAt: -1 })
      .toArray();
    return ok(
      reply,
      devices.map((device) => ({
        id: device._id.toHexString(),
        name: device.name,
        platform: device.platform,
        active: device.active,
        createdAt: device.createdAt.toISOString(),
        lastSeenAt: device.lastSeenAt.toISOString()
      }))
    );
  });

  app.post(
    "/device/revoke",
    { preHandler: [requireTrustedOrigin, requireWebAuth] },
    async (request, reply) => {
      const body = revokeSchema.parse(request.body);
      const deviceId = parseObjectId(body.deviceId, "deviceId");
      const result = await collections().devices.updateOne(
        { _id: deviceId, userId: request.webUser!._id },
        { $set: { active: false } }
      );
      return ok(reply, { revoked: result.modifiedCount > 0 });
    }
  );
}
