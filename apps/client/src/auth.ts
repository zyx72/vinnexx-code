import { hostname, platform, release } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import type { StoredAuth } from "./types.js";
import { VinnexxApi } from "./api.js";
import { saveAuth } from "./storage.js";

function openBrowser(url: string): boolean {
  const candidates: Array<[string, string[]]> = process.platform === "darwin"
    ? [["open", [url]]]
    : process.platform === "win32"
      ? [["cmd", ["/c", "start", "", url]]]
      : process.env.PREFIX?.includes("com.termux")
        ? [["termux-open-url", [url]], ["xdg-open", [url]]]
        : [["xdg-open", [url]], ["gio", ["open", url]]];
  for (const [command, args] of candidates) {
    if (process.platform !== "win32" && spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" }).status !== 0) continue;
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.on("error", () => undefined);
      child.unref();
      return true;
    } catch {
      // Try next opener.
    }
  }
  return false;
}

function safeDeviceText(value: string, fallback: string, max = 64): string {
  const cleaned = value.replace(/[^A-Za-z0-9._ -]/g, "-").replace(/\s+/g, " ").replace(/-+/g, "-").trim();
  return (cleaned || fallback).slice(0, max);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new Error("Login cancelled."));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function loginWithBrowser(input: {
  api: Pick<VinnexxApi, "startDeviceAuth" | "pollDeviceAuth" | "setAuth">;
  onInfo: (message: string) => void;
  signal?: AbortSignal;
  persist?: boolean;
}): Promise<StoredAuth> {
  const started = await input.api.startDeviceAuth(
    safeDeviceText(`${hostname()} ${platform()} ${release()}`, "device"),
    safeDeviceText(`${platform()}-${process.arch}`, "unknown", 32),
    input.signal
  );
  input.onInfo(`Open the account connection page and enter code ${started.userCode}.`);
  input.onInfo(openBrowser(started.verificationUri) ? "Browser opened. Waiting for approval…" : `Open manually: ${started.verificationUri}`);

  const deadline = performance.now() + started.expiresIn * 1_000;
  while (performance.now() < deadline) {
    await sleep(started.interval * 1_000, input.signal);
    const result = await input.api.pollDeviceAuth(started.deviceCode, started.pollSecret, input.signal);
    if (result.status === "approved") {
      if (input.persist !== false) await saveAuth(result.credentials);
      input.api.setAuth(result.credentials);
      return result.credentials;
    }
    if (result.status === "denied") throw new Error("Connection request was denied.");
    if (result.status === "expired") throw new Error("Connection request expired.");
  }
  throw new Error("Connection request expired.");
}
