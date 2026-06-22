import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { paths } from "./storage.js";
import type { TaskChange } from "./types.js";

export type HistoryManifest = {
  taskId: string;
  workspace: string;
  prompt: string;
  createdAt: string;
  status: "done" | "undone";
  entries: Array<{
    relativePath: string;
    beforeExists: boolean;
    afterExists: boolean;
    kind: TaskChange["kind"];
  }>;
};

type HistoryIndex = { tasks: Array<{ taskId: string; status: "done" | "undone" }> };

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyPath(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true, errorOnExist: false });
}

export class TaskHistory {
  private readonly taskDir: string;
  private readonly tracked = new Map<string, boolean>();

  constructor(
    readonly taskId: string,
    readonly workspace: string,
    readonly prompt: string
  ) {
    this.taskDir = join(paths.history, taskId);
  }

  async track(relativePath: string): Promise<void> {
    if (this.tracked.has(relativePath)) return;
    const source = resolve(this.workspace, relativePath);
    const present = await exists(source);
    this.tracked.set(relativePath, present);
    if (present) await copyPath(source, join(this.taskDir, "before", relativePath));
  }

  async finalize(): Promise<TaskChange[]> {
    const entries: HistoryManifest["entries"] = [];
    for (const [relativePath, beforeExists] of this.tracked.entries()) {
      const current = resolve(this.workspace, relativePath);
      const afterExists = await exists(current);
      if (afterExists) await copyPath(current, join(this.taskDir, "after", relativePath));
      const kind: TaskChange["kind"] = !beforeExists
        ? "created"
        : !afterExists
          ? "deleted"
          : "edited";
      entries.push({ relativePath, beforeExists, afterExists, kind });
    }

    const manifest: HistoryManifest = {
      taskId: this.taskId,
      workspace: this.workspace,
      prompt: this.prompt,
      createdAt: new Date().toISOString(),
      status: "done",
      entries
    };
    await mkdir(this.taskDir, { recursive: true });
    await writeFile(join(this.taskDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    await this.updateIndex("done");
    return entries.map(({ relativePath: path, kind }) => ({ path, kind }));
  }

  private async updateIndex(status: "done" | "undone"): Promise<void> {
    const indexPath = join(paths.history, "index.json");
    let index: HistoryIndex = { tasks: [] };
    try {
      index = JSON.parse(await readFile(indexPath, "utf8")) as HistoryIndex;
    } catch {
      // First history entry.
    }
    index.tasks = index.tasks.filter((task) => task.taskId !== this.taskId);
    if (status === "done") {
      const lastUndone = index.tasks.findIndex((task) => task.status === "undone");
      if (lastUndone >= 0) index.tasks = index.tasks.slice(0, lastUndone);
    }
    index.tasks.push({ taskId: this.taskId, status });
    await mkdir(paths.history, { recursive: true });
    await writeFile(indexPath, JSON.stringify(index, null, 2));
  }
}

async function loadIndex(): Promise<HistoryIndex> {
  try {
    return JSON.parse(await readFile(join(paths.history, "index.json"), "utf8")) as HistoryIndex;
  } catch {
    return { tasks: [] };
  }
}

async function saveIndex(index: HistoryIndex): Promise<void> {
  await writeFile(join(paths.history, "index.json"), JSON.stringify(index, null, 2));
}

async function loadManifest(taskId: string): Promise<HistoryManifest> {
  return JSON.parse(
    await readFile(join(paths.history, taskId, "manifest.json"), "utf8")
  ) as HistoryManifest;
}

async function restoreSnapshot(manifest: HistoryManifest, side: "before" | "after"): Promise<void> {
  const taskDir = join(paths.history, manifest.taskId);
  for (const entry of [...manifest.entries].reverse()) {
    const target = resolve(manifest.workspace, entry.relativePath);
    const shouldExist = side === "before" ? entry.beforeExists : entry.afterExists;
    await rm(target, { recursive: true, force: true });
    if (shouldExist) {
      await copyPath(join(taskDir, side, entry.relativePath), target);
    }
  }
}

export async function undoLastTask(): Promise<string> {
  const index = await loadIndex();
  const position = [...index.tasks].map((task) => task.status).lastIndexOf("done");
  if (position < 0) return "Nothing to undo.";
  const item = index.tasks[position];
  if (!item) return "Nothing to undo.";
  const manifest = await loadManifest(item.taskId);
  await restoreSnapshot(manifest, "before");
  item.status = "undone";
  manifest.status = "undone";
  await writeFile(
    join(paths.history, item.taskId, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  await saveIndex(index);
  return `Undid task ${item.taskId}.`;
}

export async function redoLastTask(): Promise<string> {
  const index = await loadIndex();
  const position = index.tasks.findIndex((task) => task.status === "undone");
  if (position < 0) return "Nothing to redo.";
  const item = index.tasks[position];
  if (!item) return "Nothing to redo.";
  const manifest = await loadManifest(item.taskId);
  await restoreSnapshot(manifest, "after");
  item.status = "done";
  manifest.status = "done";
  await writeFile(
    join(paths.history, item.taskId, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  await saveIndex(index);
  return `Redid task ${item.taskId}.`;
}
