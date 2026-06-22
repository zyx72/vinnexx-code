import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { z } from "zod";
import { assertNoSymlinkEscape, isInside } from "./workspace.js";
import type { ToolCall, ToolExecutionResult } from "./types.js";
import type { TaskHistory } from "./history.js";

const exec = promisify(execCallback);
const MAX_READ_BYTES = 240_000;
const MAX_TOOL_OUTPUT = 30_000;

const schemas = {
  list_directory: z.object({ path: z.string().default(".") }),
  read_file: z.object({ path: z.string(), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional() }),
  create_directory: z.object({ path: z.string().min(1) }),
  write_file: z.object({ path: z.string().min(1), content: z.string() }),
  edit_file: z.object({ path: z.string().min(1), oldText: z.string().min(1), newText: z.string() }),
  delete_path: z.object({ path: z.string().min(1) }),
  run_command: z.object({
  command: z.string().min(1),
  timeoutSeconds: z.number().int().min(1).max(180).default(60)
})
} as const;

type ToolName = keyof typeof schemas;

const BLOCKED_COMMANDS = [
  /(^|\s)rm\s+-rf\s+\/(\s|$)/i,
  /(^|\s)rm\s+-rf\s+~(\s|$)/i,
  /(^|\s)mkfs(\.|\s)/i,
  /(^|\s)dd\s+.*\bof=\/dev\//i,
  /:\(\)\s*\{\s*:\|:&\s*;\s*\}\s*;/,
  /(^|\s)(shutdown|reboot|poweroff)(\s|$)/i,
  /(^|\s)chmod\s+-R\s+777\s+\/(\s|$)/i
];

function truncate(value: string): string {
  if (value.length <= MAX_TOOL_OUTPUT) {
    return value;
  }

  const headLength = 22_000;
  const tailLength = 7_000;

  return [
    value.slice(0, headLength),
    "",
    `… ${value.length - headLength - tailLength} characters omitted by Vinnexx …`,
    "",
    value.slice(-tailLength)
  ].join("\n");
}

function safeRelative(workspace: string, requestedPath: string): { absolute: string; relativePath: string } {
  const absolute = resolve(workspace, requestedPath);
  if (!isInside(workspace, absolute)) throw new Error("Path is outside the trusted workspace.");
  const relativePath = relative(workspace, absolute) || ".";
  return { absolute, relativePath };
}

async function listDirectory(path: string): Promise<string> {
  const entries = await readdir(path, { withFileTypes: true });
  const output = await Promise.all(
    entries.slice(0, 300).map(async (entry) => {
      const entryPath = resolve(path, entry.name);
      const info = await stat(entryPath).catch(() => null);
      return `${entry.isDirectory() ? "d" : "-"} ${String(info?.size ?? 0).padStart(10)} ${entry.name}${entry.isDirectory() ? "/" : ""}`;
    })
  );
  if (entries.length > 300) output.push("… directory listing truncated …");
  return output.join("\n") || "(empty directory)";
}

async function readTextFile(path: string, startLine?: number, endLine?: number): Promise<string> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error("Requested path is not a file.");
  if (info.size > MAX_READ_BYTES) {
    throw new Error(`File is too large to read safely (${info.size} bytes; max ${MAX_READ_BYTES}).`);
  }
  const content = await readFile(path, "utf8");
  if (!startLine && !endLine) return content;
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, startLine ?? 1);
  const end = Math.min(lines.length, endLine ?? lines.length);
  return lines
    .slice(start - 1, end)
    .map((line, index) => `${start + index}: ${line}`)
    .join("\n");
}

export async function executeToolCall(input: {
  call: ToolCall;
  workspace: string;
  history: TaskHistory;
  onProcess: (message: string) => void;
  confirmAction: (question: string, defaultYes?: boolean) => Promise<boolean>;
}): Promise<ToolExecutionResult> {
  const { call, workspace, history, onProcess, confirmAction } = input;
  try {
    if (!(call.name in schemas)) throw new Error(`Unknown tool: ${call.name}`);
    const name = call.name as ToolName;
    const parsed = schemas[name].parse(call.arguments) as Record<string, unknown>;
    let output = "";

    if (name === "run_command") {
      const command = String(parsed.command);
      const timeoutSeconds = Number(parsed.timeoutSeconds);
      if (BLOCKED_COMMANDS.some((pattern) => pattern.test(command))) {
        throw new Error("Command blocked by the Vinnexx local safety policy.");
      }
      onProcess(`Requesting approval for: ${command}`);
      const approved = await confirmAction(`Run this command in ${workspace}?\n${command}`);
      if (!approved) throw new Error("User declined command execution.");
      onProcess(`Running ${command}`);
      const result = await exec(command, {
        cwd: workspace,
        timeout: timeoutSeconds * 1000,
        maxBuffer: 512 * 1024,
        env: { ...process.env, CI: "1" }
      });
      output = `${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ""}`.trim() || "Command completed successfully with no output.";
      return { toolCallId: call.id, name, ok: true, output: truncate(output) };
    }

    const requestedPath = String(parsed.path ?? ".");
    const safe = safeRelative(workspace, requestedPath);
    await assertNoSymlinkEscape(workspace, safe.absolute);

    if (["create_directory", "write_file", "edit_file", "delete_path"].includes(name) && safe.relativePath === ".") {
      throw new Error("Mutating the workspace root directly is not allowed.");
    }

    switch (name) {
      case "list_directory":
        onProcess(`Listing ${safe.relativePath}`);
        output = await listDirectory(safe.absolute);
        break;
      case "read_file":
        onProcess(`Reading ${safe.relativePath}`);
        output = await readTextFile(
          safe.absolute,
          parsed.startLine === undefined ? undefined : Number(parsed.startLine),
          parsed.endLine === undefined ? undefined : Number(parsed.endLine)
        );
        break;
      case "create_directory":
        onProcess(`Creating ${safe.relativePath}`);
        await history.track(safe.relativePath);
        await mkdir(safe.absolute, { recursive: true });
        output = `Created directory ${safe.relativePath}.`;
        break;
      case "write_file":
        onProcess(`Writing ${safe.relativePath}`);
        await history.track(safe.relativePath);
        await mkdir(dirname(safe.absolute), { recursive: true });
        await writeFile(safe.absolute, String(parsed.content), "utf8");
        output = `Wrote ${Buffer.byteLength(String(parsed.content), "utf8")} bytes to ${safe.relativePath}.`;
        break;
      case "edit_file": {
        onProcess(`Editing ${safe.relativePath}`);
        const current = await readTextFile(safe.absolute);
        const oldText = String(parsed.oldText);
        const occurrences = current.split(oldText).length - 1;
        if (occurrences !== 1) {
          throw new Error(`edit_file requires oldText to occur exactly once; found ${occurrences}.`);
        }
        await history.track(safe.relativePath);
        await writeFile(safe.absolute, current.replace(oldText, String(parsed.newText)), "utf8");
        output = `Edited ${safe.relativePath}.`;
        break;
      }
      case "delete_path": {
        if (safe.relativePath === ".") throw new Error("Refusing to delete the workspace root.");
        onProcess(`Requesting deletion approval for ${safe.relativePath}`);
        const approved = await confirmAction(`Delete ${safe.relativePath}?`);
        if (!approved) throw new Error("User declined deletion.");
        await history.track(safe.relativePath);
        await rm(safe.absolute, { recursive: true, force: true });
        output = `Deleted ${safe.relativePath}.`;
        break;
      }
      default:
        throw new Error(`Unsupported tool: ${name satisfies never}`);
    }
    return { toolCallId: call.id, name, ok: true, output: truncate(output) };
  } catch (error) {
    return {
      toolCallId: call.id,
      name: call.name,
      ok: false,
      output: error instanceof Error ? error.message : String(error)
    };
  }
}
