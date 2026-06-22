import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { ClientConfig, StoredAuth } from "./types.js";

const DEFAULT_API_URL = "https://api.vinnexx.zone.id/api/v1";

type StoredClientConfig = Omit<ClientConfig, "serverBaseUrl"> & {
  serverBaseUrl?: never;
};

function defaultHome(): string {
  if (process.env.VINNEXX_HOME) return resolve(process.env.VINNEXX_HOME);

  const isTermux =
    process.env.PREFIX?.includes("com.termux") ||
    process.env.HOME?.includes("/data/data/com.termux");

  if (isTermux) return "/storage/emulated/0/.vinnexx";
  return join(homedir(), ".vinnexx");
}

const DEFAULT_HOME = defaultHome();

export const paths = {
  home: DEFAULT_HOME,
  config: join(DEFAULT_HOME, "settings.json"),
  auth: join(DEFAULT_HOME, "auth", "account.json"),
  cache: join(DEFAULT_HOME, "cache"),
  history: join(DEFAULT_HOME, "history"),
  temp: join(DEFAULT_HOME, "temp"),
  memory: join(DEFAULT_HOME, "memory"),
  projects: join(DEFAULT_HOME, "projects"),
  workspace: join(DEFAULT_HOME, "workspace"),
  logs: join(DEFAULT_HOME, "logs")
};

export async function ensureStorage(): Promise<void> {
  await Promise.all([
    mkdir(dirname(paths.auth), { recursive: true }),
    mkdir(paths.cache, { recursive: true }),
    mkdir(paths.history, { recursive: true }),
    mkdir(paths.temp, { recursive: true }),
    mkdir(paths.memory, { recursive: true }),
    mkdir(paths.projects, { recursive: true }),
    mkdir(paths.workspace, { recursive: true }),
    mkdir(paths.logs, { recursive: true })
  ]);
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600).catch(() => undefined);
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

export async function loadConfig(): Promise<ClientConfig> {
  const saved = await readJson<Partial<ClientConfig>>(paths.config);
  const workspace = saved?.workspace ?? paths.workspace;
  const rootDir = saved?.rootDir ?? paths.home;

  const config: ClientConfig = {
    serverBaseUrl: process.env.VINNEXX_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_URL,
    trustedWorkspaces: saved?.trustedWorkspaces ?? [workspace],
    language: saved?.language === "id" ? "id" : "en",
    rootDir,
    workspace,
    theme: "cyber",
    clearOnStart: true
  };

  await saveConfig(config);
  return config;
}

export async function saveConfig(config: ClientConfig): Promise<void> {
  const stored: StoredClientConfig = {
    trustedWorkspaces: config.trustedWorkspaces,
    language: config.language,
    rootDir: config.rootDir,
    workspace: config.workspace,
    theme: "cyber",
    clearOnStart: true
  };
  await writeJsonAtomic(paths.config, stored);
}

export async function loadAuth(): Promise<StoredAuth | null> {
  return readJson<StoredAuth>(paths.auth);
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
  await writeJsonAtomic(paths.auth, auth);
}

export async function clearAuth(): Promise<void> {
  await writeJsonAtomic(paths.auth, null);
}
