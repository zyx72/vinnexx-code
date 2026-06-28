import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { ClientConfig, PublicModel, StoredAuth } from "./types.js";

function defaultHome(): string {
  if (process.env.VINNEXX_HOME) return resolve(process.env.VINNEXX_HOME);
  const isTermux =
    process.env.PREFIX?.includes("com.termux") === true ||
    process.env.HOME?.includes("/data/data/com.termux") === true;
  if (isTermux || existsSync("/storage/emulated/0")) {
    return "/storage/emulated/0/.vinnexx";
  }
  return join(homedir(), ".vinnexx");
}

const DEFAULT_HOME = defaultHome();

export const paths = {
  home: DEFAULT_HOME,
  settings: join(DEFAULT_HOME, "settings.json"),
  legacyConfig: join(DEFAULT_HOME, "config.json"),
  auth: join(DEFAULT_HOME, "auth", "account.json"),
  cache: join(DEFAULT_HOME, "cache"),
  history: join(DEFAULT_HOME, "history"),
  logs: join(DEFAULT_HOME, "logs"),
  memory: join(DEFAULT_HOME, "memory"),
  projects: join(DEFAULT_HOME, "projects"),
  temp: join(DEFAULT_HOME, "temp"),
  workspace: join(DEFAULT_HOME, "workspace")
};

export async function ensureStorage(): Promise<void> {
  await Promise.all([
    mkdir(dirname(paths.auth), { recursive: true }),
    mkdir(paths.cache, { recursive: true }),
    mkdir(paths.history, { recursive: true }),
    mkdir(paths.logs, { recursive: true }),
    mkdir(paths.memory, { recursive: true }),
    mkdir(paths.projects, { recursive: true }),
    mkdir(paths.temp, { recursive: true }),
    mkdir(paths.workspace, { recursive: true })
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
    if (code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

function validModel(value: unknown): PublicModel {
  return value === "united" ? "united" : "strummer";
}

export async function loadConfig(): Promise<ClientConfig> {
  const saved =
    (await readJson<Partial<ClientConfig>>(paths.settings)) ??
    (await readJson<Partial<ClientConfig> & { theme?: unknown; serverBaseUrl?: unknown }>(paths.legacyConfig));

  const rootDir = typeof saved?.rootDir === "string" ? resolve(saved.rootDir) : paths.home;
  const workspace = typeof saved?.workspace === "string" ? resolve(saved.workspace) : paths.workspace;
  const trusted = Array.isArray(saved?.trustedWorkspaces)
    ? saved.trustedWorkspaces.filter((item): item is string => typeof item === "string").map((item) => resolve(item))
    : [];

  const config: ClientConfig = {
    language: saved?.language === "id" ? "id" : "en",
    rootDir,
    workspace,
    selectedPublicModel: validModel(saved?.selectedPublicModel),
    trustedWorkspaces: Array.from(new Set([workspace, ...trusted]))
  };

  await saveConfig(config);
  await unlink(paths.legacyConfig).catch(() => undefined);
  return config;
}

export async function saveConfig(config: ClientConfig): Promise<void> {
  const safe: ClientConfig = {
    language: config.language,
    rootDir: resolve(config.rootDir),
    workspace: resolve(config.workspace),
    selectedPublicModel: validModel(config.selectedPublicModel),
    trustedWorkspaces: Array.from(new Set(config.trustedWorkspaces.map((item) => resolve(item))))
  };
  await writeJsonAtomic(paths.settings, safe);
}

export async function loadAuth(): Promise<StoredAuth | null> {
  return readJson<StoredAuth>(paths.auth);
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
  await writeJsonAtomic(paths.auth, auth);
}

export async function clearAuth(): Promise<void> {
  await unlink(paths.auth).catch(() => undefined);
}

export async function saveLongText(content: string): Promise<{ path: string; name: string }> {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const name = `longtext-${stamp}.txt`;
  const path = join(paths.temp, name);
  await writeFile(path, content, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
  return { path, name };
}
