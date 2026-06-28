import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, relative, resolve, sep } from "node:path";
import type { ClientConfig } from "./types.js";
import { saveConfig } from "./storage.js";

const IGNORED = new Set([
  ".git", ".github", "node_modules", "dist", "build", ".next", ".cache", ".turbo",
  ".vercel", "coverage", "vendor", "__pycache__", ".idea", ".vscode"
]);
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".7z", ".rar",
  ".gz", ".tar", ".mp3", ".mp4", ".wav", ".ogg", ".woff", ".woff2", ".ttf", ".otf",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".apk", ".jar", ".class", ".pyc", ".lockb"
]);
const TREE_TTL_MS = 3_000;
const treeCache = new Map<string, { at: number; value: string }>();

export function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

export async function ensureWorkspaceTrusted(
  workspace: string,
  config: ClientConfig,
  confirmAction: (question: string, defaultYes?: boolean) => Promise<boolean>
): Promise<boolean> {
  const normalized = await realpath(workspace).catch(() => resolve(workspace));
  if (config.trustedWorkspaces.some((entry) => resolve(entry) === normalized)) return true;
  const trusted = await confirmAction(
    `Trust workspace ${normalized}? Vinnexx may read, create, edit, delete files and run approved commands inside it.`
  );
  if (trusted) {
    config.trustedWorkspaces.push(normalized);
    await saveConfig(config);
  }
  return trusted;
}

export async function assertNoSymlinkEscape(root: string, target: string): Promise<void> {
  const normalizedRoot = await realpath(root);
  const targetResolved = resolve(target);
  if (!isInside(normalizedRoot, targetResolved)) throw new Error("Path is outside the trusted workspace.");
  const rel = relative(normalizedRoot, targetResolved);
  if (!rel) return;
  let current = normalizedRoot;
  for (const part of rel.split(sep)) {
    current = resolve(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${part}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

export function invalidateWorkspaceTree(root: string): void {
  treeCache.delete(resolve(root));
}

export async function buildWorkspaceTree(
  root: string,
  maxDepth = 4,
  maxEntries = 120,
  maxChars = 25_000
): Promise<string> {
  const key = resolve(root);
  const cached = treeCache.get(key);
  if (cached && performance.now() - cached.at < TREE_TTL_MS) return cached.value;

  const lines: string[] = [`${basename(root)}/`];
  let count = 0;
  let chars = lines[0]?.length ?? 0;

  async function walk(directory: string, depth: number, prefix: string): Promise<void> {
    if (depth > maxDepth || count >= maxEntries || chars >= maxChars) return;
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => !IGNORED.has(entry.name))
      .filter((entry) => entry.isDirectory() || !BINARY_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

    for (let index = 0; index < entries.length && count < maxEntries && chars < maxChars; index += 1) {
      const entry = entries[index];
      if (!entry) continue;
      const entryPath = resolve(directory, entry.name);
      const info = await lstat(entryPath).catch(() => null);
      if (!info || info.isSymbolicLink()) continue;
      const last = index === entries.length - 1;
      const line = `${prefix}${last ? "└──" : "├──"} ${entry.name}${entry.isDirectory() ? "/" : ""}`;
      lines.push(line);
      chars += line.length + 1;
      count += 1;
      if (entry.isDirectory()) {
        await walk(entryPath, depth + 1, `${prefix}${last ? "    " : "│   "}`);
      }
    }
  }

  try {
    const info = await stat(root);
    if (info.isDirectory()) await walk(root, 1, "");
  } catch {
    return `${basename(root)}/ (unavailable)`;
  }
  if (count >= maxEntries || chars >= maxChars) lines.push("… tree truncated …");
  const value = lines.join("\n").slice(0, maxChars);
  treeCache.set(key, { at: performance.now(), value });
  return value;
}
