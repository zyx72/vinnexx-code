import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api.js";
import { loginWithBrowser } from "../src/auth.js";
import { executeToolCall } from "../src/tools.js";
import {
  guestMayUse,
  localInternalAnswer,
  parseModelCommand,
  profileText,
  setupText,
  shouldUseLocalReviewFallback
} from "../src/tui/app.js";
import { runSetupMenu } from "../src/tui/setup-menu.js";
import type { ClientConfig, StoredAuth } from "../src/types.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("client integration helpers", () => {

  it("enforces guest commands and answers internal requests locally", () => {
    expect(guestMayUse("/login")).toBe(true);
    expect(guestMayUse("/setup edit")).toBe(true);
    expect(guestMayUse("hello")).toBe(false);
    expect(guestMayUse("/model united")).toBe(false);
    expect(localInternalAnswer("hello", "strummer")).toContain("Strummer0.5");
    expect(localInternalAnswer("siapa kamu", "united")).toContain("United0.5");
    expect(localInternalAnswer("cara keluar", "strummer")).toContain("/exit");
  });

  it("formats setup/profile without internal routing and parses model switches", () => {
    const config: ClientConfig = {
      language: "id",
      rootDir: "/storage/emulated/0/.vinnexx",
      workspace: "/storage/emulated/0/.vinnexx/workspace",
      selectedPublicModel: "strummer",
      trustedWorkspaces: ["/storage/emulated/0/.vinnexx/workspace"]
    };
    const setup = setupText(config);
    expect(setup).toContain("/sdcard/.vinnexx/workspace");
    expect(setup).toContain("Strummer0.5");
    expect(setup).not.toMatch(/https?:\/\//);
    expect(parseModelCommand("/model united")).toBe("united");
    expect(parseModelCommand("/model strummer")).toBe("strummer");
    expect(() => parseModelCommand("/model invalid")).toThrow();

    const profile = profileText(
      { id: "1", username: "tester", email: "tester@example.com", plan: "free", deviceStatus: "active" },
      { plan: "free", used: 10, limit: 100, remaining: 90, resetAt: "2026-06-25T10:00:00.000Z" },
      "united"
    );
    expect(profile).toContain("United0.5");
    expect(profile).toContain("Remaining limit: 90");
    expect(profile).toContain("Account/device status: active");
    expect(profile).not.toMatch(/https?:\/\//);
  });
  it("completes the device login polling flow", async () => {
    const credentials: StoredAuth = {
      deviceToken: "device-token",
      signingSecret: Buffer.alloc(32, 3).toString("base64url"),
      account: { id: "1", username: "tester", email: "tester@example.com", plan: "free" }
    };
    let auth: StoredAuth | null = null;
    const api = {
      startDeviceAuth: vi.fn(async () => ({
        deviceCode: "device", pollSecret: "poll", userCode: "ABCD-EFGH",
        verificationUri: "https://account.example/connect", expiresIn: 5, interval: 0
      })),
      pollDeviceAuth: vi.fn(async () => ({ status: "approved" as const, credentials })),
      setAuth: vi.fn((value: StoredAuth | null) => { auth = value; })
    };
    const result = await loginWithBrowser({ api, onInfo: () => undefined, persist: false });
    expect(result.account.username).toBe("tester");
    expect(auth).toEqual(credentials);
  });

  it("edits setup values through the interactive menu contract", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "vinnexx-setup-"));
    tempDirs.push(workspace);
    const config: ClientConfig = {
      language: "en",
      rootDir: workspace,
      workspace,
      selectedPublicModel: "strummer",
      trustedWorkspaces: [workspace]
    };
    const selections = [0, 1, 3, 1, 4];
    const fakeInput = {
      select: vi.fn(async () => selections.shift() ?? null),
      readLine: vi.fn(async () => ({ text: workspace, displayText: workspace }))
    };
    const fakeScreen = { addMessage: vi.fn() };
    const result = await runSetupMenu({
      config,
      screen: fakeScreen as never,
      terminalInput: fakeInput as never
    });
    expect(result.language).toBe("id");
    expect(result.selectedPublicModel).toBe("united");
  });

  it("creates, writes, edits, and reads files inside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "vinnexx-tools-"));
    tempDirs.push(workspace);
    const history = { track: vi.fn(async () => undefined) };
    const base = { workspace, history: history as never, onProcess: () => undefined, confirmAction: async () => true };
    expect((await executeToolCall({ ...base, call: { id: "1", name: "create_directory", arguments: { path: "demo" } } })).ok).toBe(true);
    expect((await executeToolCall({ ...base, call: { id: "2", name: "write_file", arguments: { path: "demo/a.txt", content: "hello" } } })).ok).toBe(true);
    expect((await executeToolCall({ ...base, call: { id: "3", name: "edit_file", arguments: { path: "demo/a.txt", oldText: "hello", newText: "world" } } })).ok).toBe(true);
    const read = await executeToolCall({ ...base, call: { id: "4", name: "read_file", arguments: { path: "demo/a.txt" } } });
    expect(read.ok).toBe(true);
    expect(read.output).toBe("world");
    expect(await readFile(join(workspace, "demo/a.txt"), "utf8")).toBe("world");
  });

  it("does not inherit secret-like environment variables in approved shell tools", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "vinnexx-shell-"));
    tempDirs.push(workspace);
    process.env.TEST_API_KEY = "must-not-leak";
    try {
      const result = await executeToolCall({
        workspace,
        history: { track: vi.fn(async () => undefined) } as never,
        onProcess: () => undefined,
        confirmAction: async () => true,
        call: {
          id: "shell",
          name: "run_command",
          arguments: { command: `node -e "process.stdout.write(process.env.TEST_API_KEY || 'redacted')"` }
        }
      });
      expect(result.ok).toBe(true);
      expect(result.output).toBe("redacted");
    } finally {
      delete process.env.TEST_API_KEY;
    }
  });

  it("uses the honest local fallback only for a successful review timeout", () => {
    expect(shouldUseLocalReviewFallback(new ApiError("timeout", 0, "review_timeout"), true, false)).toBe(true);
    expect(shouldUseLocalReviewFallback(new ApiError("timeout", 0, "review_timeout"), true, true)).toBe(false);
    expect(shouldUseLocalReviewFallback(new Error("other"), true, false)).toBe(false);
  });
});
