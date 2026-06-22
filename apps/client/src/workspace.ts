import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import type { ClientConfig } from "./types.js";
import { saveConfig } from "./storage.js";

const IGNORED = new Set([
  ".git",
  ".github",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".cache",
  ".turbo",
  ".vercel",
  "coverage",
  "vendor",
  "__pycache__",
  ".idea",
  ".vscode"
]);

export function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  );
}

export async function ensureWorkspaceTrusted(
  workspace: string,
  config: ClientConfig,
  confirmAction: (question: string, defaultYes?: boolean) => Promise<boolean>
): Promise<boolean> {
  const normalized = await realpath(workspace).catch(() => resolve(workspace));
  if (config.trustedWorkspaces.some((entry) => resolve(entry) === normalized)) return true;
  console.log(`\nWorkspace: ${normalized}`);
  const trusted = await confirmAction(
    "Trust this workspace? Vinnexx may read, create, edit, delete files and run approved commands here."
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
  if (!isInside(normalizedRoot, targetResolved)) throw new Error("Path is outside the workspace.");

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

export async function buildWorkspaceTree(
  root: string,
  maxDepth = 3,
  maxEntries = 120
): Promise<string> {
  const lines: string[] = [`${basename(root)}/`];
  let count = 0;

  async function walk(directory: string, depth: number, prefix: string): Promise<void> {
    if (depth > maxDepth || count >= maxEntries) return;
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => !IGNORED.has(entry.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

    for (let index = 0; index < entries.length && count < maxEntries; index += 1) {
      const entry = entries[index];
      if (!entry) continue;
      const last = index === entries.length - 1;
      lines.push(`${prefix}${last ? "└──" : "├──"} ${entry.name}${entry.isDirectory() ? "/" : ""}`);
      count += 1;
      if (entry.isDirectory()) {
        await walk(resolve(directory, entry.name), depth + 1, `${prefix}${last ? "    " : "│   "}`);
      }
    }
  }

  try {
    const info = await stat(root);
    if (info.isDirectory()) await walk(root, 1, "");
  } catch {
    return `${basename(root)}/ (unavailable)`;
  }
  if (count >= maxEntries) lines.push("… tree truncated …");
  return lines.join("\n");
}
