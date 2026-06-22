import { hostname, platform, release } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import type { StoredAuth } from "./types.js";
import { VinnexxApi } from "./api.js";
import { saveAuth } from "./storage.js";

function openBrowser(url: string): boolean {
  const candidates: Array<[string, string[]]> =
    process.platform === "darwin"
      ? [["open", [url]]]
      : process.platform === "win32"
        ? [["cmd", ["/c", "start", "", url]]]
        : process.env.PREFIX?.includes("com.termux")
          ? [["termux-open-url", [url]], ["xdg-open", [url]]]
          : [["xdg-open", [url]], ["gio", ["open", url]]];

  for (const [command, args] of candidates) {
    if (process.platform !== "win32") {
      const found = spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
      if (found.status !== 0) continue;
    }
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.on("error", () => undefined);
      child.unref();
      return true;
    } catch {
      // Try the next opener.
    }
  }
  return false;
}

function safeDeviceText(value: string, fallback: string, max = 64): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._ -]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim();

  return (cleaned || fallback).slice(0, max);
}

export async function loginWithBrowser(api: VinnexxApi): Promise<StoredAuth> {
  const started = await api.startDeviceAuth(
  safeDeviceText(`${hostname()} ${platform()} ${release()}`, "device", 64),
  safeDeviceText(`${platform()}-${process.arch}`, "unknown", 32)
);

  console.log(`\nOpen this URL to connect your Vinnexx account:\n${started.verificationUri}`);
  console.log(`Connection code: ${started.userCode}\n`);
  if (openBrowser(started.verificationUri)) {
    console.log("[>_]Browser opened. Waiting for approval...");
  } else {
    console.log("[>_]Could not open a browser automatically. Open the URL manually.");
  }

  const deadline = Date.now() + started.expiresIn * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, started.interval * 1000));
    const result = await api.pollDeviceAuth(started.deviceCode, started.pollSecret);
    if (result.status === "approved") {
      await saveAuth(result.credentials);
      api.setAuth(result.credentials);
      return result.credentials;
    }
    if (result.status === "denied") throw new Error("Connection request was denied.");
    if (result.status === "expired") throw new Error("Connection request expired.");
  }
  throw new Error("Connection request expired.");
}

