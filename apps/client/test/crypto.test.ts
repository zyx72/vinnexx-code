import { describe, expect, it } from "vitest";
import { signRequest, stableStringify } from "../src/crypto.js";

describe("client request signing", () => {
  it("canonicalizes object keys", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("creates deterministic HMAC signatures", () => {
    const input = {
      secret: Buffer.alloc(32, 7).toString("base64url"),
      method: "POST",
      path: "/cli/chat/start",
      timestamp: "1700000000",
      nonce: "abc",
      body: { message: "hello" }
    };
    expect(signRequest(input)).toBe(signRequest(input));
  });
});
