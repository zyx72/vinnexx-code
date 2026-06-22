import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  decryptJson,
  encryptJson,
  requestSignature,
  stableStringify
} from "../src/security/crypto.js";

describe("server security primitives", () => {
  it("canonicalizes JSON deterministically", () => {
    expect(stableStringify({ z: 1, a: [2, { b: true, a: false }] })).toBe(
      '{"a":[2,{"a":false,"b":true}],"z":1}'
    );
  });

  it("signs and compares requests", () => {
    const signature = requestSignature({
      secret: Buffer.alloc(32, 4).toString("base64url"),
      method: "POST",
      path: "/api/v1/cli/usage",
      timestamp: "1700000000",
      nonce: "nonce_value_123",
      body: { a: 1 }
    });
    expect(constantTimeEqual(signature, signature)).toBe(true);
    expect(constantTimeEqual(signature, `${signature}x`)).toBe(false);
  });

  it("encrypts and decrypts device data", () => {
    const key = Buffer.alloc(32, 9);
    const encrypted = encryptJson({ secret: "value" }, key);
    expect(decryptJson<{ secret: string }>(encrypted, key)).toEqual({ secret: "value" });
  });
});
