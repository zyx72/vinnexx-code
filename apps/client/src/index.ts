import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import {
  ensureStorage,
  loadAuth,
  loadConfig,
  saveConfig,
  clearAuth,
  paths
} from "./storage.js";
import { VinnexxApi, ApiError } from "./api.js";
import { loginWithBrowser } from "./auth.js";
import { LiveStatus } from "./status.js";
import { buildWorkspaceTree, ensureWorkspaceTrusted } from "./workspace.js";
import { executeToolCall } from "./tools.js";
import { TaskHistory, redoLastTask, undoLastTask } from "./history.js";
import type { ChatResponse, ClientConfig, StoredAuth, ToolCall, ToolExecutionResult } from "./types.js";

const VERSION = "0.2.0";
const MODEL_NAME = "Cosmic0.1";
const POWERED_BY = "vinnexxCode by zyx72";
const MAX_DIRECT_PROMPT_CHARS = 100;

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  redBg: "\x1b[41m",
  white: "\x1b[37m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m"
};

function prettyPath(path: string): string {
  return path.replace("/storage/emulated/0", "/sdcard");
}

function logo(): string {
  return `${c.red}${c.bold}
██╗   ██╗██╗███╗   ██╗███╗   ██╗███████╗██╗  ██╗██╗  ██╗
██║   ██║██║████╗  ██║████╗  ██║██╔════╝╚██╗██╔╝╚██╗██╔╝
██║   ██║██║██╔██╗ ██║██╔██╗ ██║█████╗   ╚███╔╝  ╚███╔╝
╚██╗ ██╔╝██║██║╚██╗██║██║╚██╗██║██╔══╝   ██╔██╗  ██╔██╗
 ╚████╔╝ ██║██║ ╚████║██║ ╚████║███████╗██╔╝ ██╗██╔╝ ██╗
  ╚═══╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝
${c.reset}`;
}

function banner(auth?: StoredAuth | null, config?: ClientConfig, workspace?: string): void {
  console.clear();
  console.log(logo());
  console.log(`${c.bold}Vinnexx Code v${VERSION}${c.reset}  ${c.dim}${POWERED_BY}${c.reset}`);
  console.log(`${c.dim}Type /help for commands. Type /exit to quit.${c.reset}`);

  if (auth) {
    console.log(`${c.red}● signed in${c.reset} as ${c.bold}${auth.account.username}${c.reset}`);
  } else {
    console.log(`${c.yellow}● not signed in${c.reset} — use ${c.bold}/login${c.reset}`);
  }

  if (config && workspace) {
    console.log(`${c.dim}root:${c.reset} ${prettyPath(config.rootDir ?? paths.home)}`);
    console.log(`${c.dim}workspace:${c.reset} ${prettyPath(workspace)}`);
  }

  console.log(`${c.dim}model:${c.reset} ${MODEL_NAME}`);
  console.log("");
}

function prompt(auth: StoredAuth | null, workspace: string): string {
  const name = auth?.account.username ?? "guest";
  const shortPath = prettyPath(workspace).split("/").slice(-2).join("/");
  return `${c.red}${name}@vinnexx${c.reset} ${c.dim}${shortPath}${c.reset} ${c.red}❯${c.reset} `;
}

function printHelp(auth: StoredAuth | null): void {
  console.log(`
${c.bold}${c.red}Commands${c.reset}
  /help                         Show this help
  /login                        Connect a Vinnexx account
  /logout                       Revoke this device session
  /profile                      Show account, model and usage details
  /status                       Show short account status
  /model                        Show model identity
  /setup                        Show client settings
  /setup edit                   Open interactive client settings
  /setup language en|id          Change language
  /setup root PATH               Change Vinnexx root directory
  /setup workspace PATH          Change workspace
  /project [path]                Switch trusted local workspace
  /memory                       List synced memories
  /memory set KEY VALUE          Save memory
  /undo                         Undo latest local task
  /redo                         Redo latest undone task
  /clear                        Clear terminal
  /exit                         Exit Vinnexx

${auth ? `${c.red}Ready.${c.reset}` : `${c.yellow}Login required before chat commands.${c.reset}`}
`);
}

async function ensureLoggedIn(api: VinnexxApi, auth: StoredAuth | null): Promise<StoredAuth> {
  if (auth) return auth;
  throw new Error("Please login first using /login.");
}

async function showProfile(api: VinnexxApi): Promise<void> {
  const [account, usage] = await Promise.all([api.getAccount(), api.getUsage()]);
  const resetIn = Math.max(0, new Date(usage.resetAt).getTime() - Date.now());
  const minutes = Math.ceil(resetIn / 60_000);

  console.log(`
${c.bold}${c.red}Profile${c.reset}
  Account : ${account.username}
  Email   : ${account.email}
  Plan    : ${account.plan}
  Model   : ${MODEL_NAME}
  Tokens  : ${usage.remaining ?? "∞"} / ${usage.limit ?? "∞"}
  Reset   : ${minutes} minute${minutes === 1 ? "" : "s"}
`);
}

async function showShortStatus(api: VinnexxApi): Promise<void> {
  const [account, usage] = await Promise.all([api.getAccount(), api.getUsage()]);
  console.log(`${c.red}Online${c.reset} · ${account.username} · ${account.plan} · ${usage.remaining ?? "∞"} tokens left`);
}

function showSetup(config: ClientConfig, workspace: string): void {
  console.log(`
${c.bold}${c.red}Client setup${c.reset}
  Language       : ${config.language === "id" ? "Indonesian" : "English"}
  Root directory : ${prettyPath(config.rootDir ?? paths.home)}
  Workspace      : ${prettyPath(workspace)}
`);
}

type SetupChoice = "language" | "root" | "workspace";

async function chooseSetupOption(): Promise<SetupChoice | null> {
  if (!stdin.isTTY) return null;

  const choices: Array<{ key: SetupChoice; label: string }> = [
    { key: "language", label: "Language" },
    { key: "root", label: "Root directory" },
    { key: "workspace", label: "Workspace" }
  ];

  let selected = 0;

  function render(): void {
    console.clear();
    console.log(logo());
    console.log(`${c.bold}${c.red}Client settings${c.reset}\n`);
    choices.forEach((choice, index) => {
      const active = index === selected;
      const line = `${active ? "➜" : " "} ${choice.label}`;
      console.log(active ? `${c.redBg}${c.white}${c.bold}${line.padEnd(32)}${c.reset}` : `  ${line}`);
    });
    console.log(`\n${c.dim}↑↓ move · Enter select · Esc cancel${c.reset}`);
  }

  render();
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolveChoice) => {
    const onKey = (_chunk: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        resolveChoice(null);
        return;
      }
      if (key.name === "escape") {
        cleanup();
        resolveChoice(null);
        return;
      }
      if (key.name === "up") {
        selected = (selected - 1 + choices.length) % choices.length;
        render();
        return;
      }
      if (key.name === "down") {
        selected = (selected + 1) % choices.length;
        render();
        return;
      }
      if (key.name === "return") {
        const value = choices[selected]?.key ?? null;
        cleanup();
        resolveChoice(value);
      }
    };

    function cleanup(): void {
      stdin.off("keypress", onKey);
      stdin.setRawMode(false);
      console.clear();
    }

    stdin.on("keypress", onKey);
  });
}

async function updateSetup(
  input: string,
  config: ClientConfig,
  workspace: string,
  ask: (question: string) => Promise<string>
): Promise<{ config: ClientConfig; workspace: string }> {
  const args = input.slice("/setup".length).trim();

  if (!args) {
    showSetup(config, workspace);
    return { config, workspace };
  }

  let key: string;
  let value: string;

  if (args === "edit") {
    const choice = await chooseSetupOption();
    if (!choice) return { config, workspace };
    key = choice;
    value = (await ask(`${c.red}${choice}${c.reset} value ❯ `)).trim();
  } else {
    const [first, ...rest] = args.split(" ");
    key = first ?? "";
    value = rest.join(" ").trim();
  }

  if (key === "language") {
    if (value !== "en" && value !== "id") throw new Error("Usage: /setup language en|id");
    config.language = value;
  } else if (key === "root") {
    if (!value) throw new Error("Usage: /setup root PATH");
    config.rootDir = resolve(value);
  } else if (key === "workspace") {
    if (!value) throw new Error("Usage: /setup workspace PATH");
    workspace = resolve(value);
    config.workspace = workspace;
    if (!config.trustedWorkspaces.includes(workspace)) config.trustedWorkspaces.push(workspace);
    await mkdir(workspace, { recursive: true });
    process.chdir(workspace);
  } else {
    throw new Error("Unknown setup option. Use /setup or /setup edit.");
  }

  await saveConfig(config);
  console.log(`${c.red}✓ Setup updated.${c.reset}`);
  showSetup(config, workspace);
  return { config, workspace };
}

function handleLocalQuestion(input: string): boolean {
  const lower = input.toLowerCase();
  if (lower.includes("siapa kamu") || lower.includes("kamu siapa") || lower.includes("who are you")) {
    console.log(`\nSaya ${c.bold}${MODEL_NAME}${c.reset}, asisten coding terminal di Vinnexx Code yang dibuat oleh Vinnexx/zyx72.\n`);
    return true;
  }
  if (lower.includes("cara keluar") || lower.includes("keluar dari vinnexx") || lower.includes("exit vinnexx")) {
    console.log(`\nGunakan ${c.bold}/exit${c.reset} untuk keluar dari Vinnexx Code.\n`);
    return true;
  }
  if (lower.includes("cek limit") || lower.includes("sisa limit") || lower.includes("lihat limit")) {
    console.log(`\nGunakan ${c.bold}/profile${c.reset} untuk melihat akun, plan, token, dan waktu reset.\n`);
    return true;
  }
  return false;
}

async function saveLongInput(workspace: string, input: string): Promise<void> {
  const fileName = `longtext-${Date.now()}.txt`;
  const target = resolve(workspace, fileName);
  await writeFile(target, input, "utf8");
  console.log(`${c.yellow}dont prompting there${c.reset}`);
  console.log(`Long text saved as ${c.bold}${fileName}${c.reset}. Ask Cosmic0.1 to read or use that file instead.\n`);
}

async function runChat(
  api: VinnexxApi,
  promptText: string,
  workspace: string,
  confirmAction: (question: string, defaultYes?: boolean) => Promise<boolean>
): Promise<void> {
  const status = new LiveStatus();
  let response: ChatResponse;
  status.start("thinking", "Understanding your request", `Model: ${MODEL_NAME}`);
  try {
    const tree = await buildWorkspaceTree(workspace);
    response = await api.startChat(promptText, tree);
  } catch (error) {
    status.stop(false);
    throw error;
  }

  let history: TaskHistory | null = null;
  const commands: string[] = [];
  let loops = 0;
  let finalAnswer = "";

  while (response.type === "tool_calls") {
    loops += 1;
    if (loops > 8) {
      status.stop(false);
      throw new Error("Tool loop limit reached. The task was stopped safely.");
    }

    history ??= new TaskHistory(response.sessionId || randomUUID(), workspace, promptText);
    const results: ToolExecutionResult[] = [];
    const calls = response.calls;
    status.switchMode("working", "Processing workspace changes", `${calls.length} local action${calls.length === 1 ? "" : "s"} requested`);

    for (let index = 0; index < calls.length; index += 1) {
      const call = calls[index] as ToolCall;
      status.setProgress(Math.round((index / Math.max(1, calls.length)) * 100));

      if (call.name === "run_command") {
        const command = call.arguments.command;
        if (typeof command === "string") commands.push(command);
      }

      const needsPrompt = call.name === "run_command" || call.name === "delete_path";
      if (needsPrompt) status.stop(false);

      const result = await executeToolCall({
        call,
        workspace,
        history,
        onProcess: (message) => status.updateProcess(message),
        confirmAction
      });

      if (needsPrompt) status.start("working", `Completed ${call.name}...`, `Model: ${MODEL_NAME}`);
      results.push(result);
      status.setProgress(Math.round(((index + 1) / calls.length) * 100));
    }

    status.switchMode("reviewing", "Reviewing tool results", `${results.length} local tool result${results.length === 1 ? "" : "s"} submitted · Model: ${MODEL_NAME}`);
    response = await api.continueChat(
      response.sessionId,
      results.map((result) => ({
        ...result,
        output:
          result.output.length > 30_000
            ? `${result.output.slice(0, 30_000)}\n… output truncated …`
            : result.output
      }))
    );
  }

  finalAnswer = response.content;
  status.stop(false);
  console.log(`\n${finalAnswer}\n`);

  const changes = history ? await history.finalize() : [];
  await api.completeTask({ sessionId: response.sessionId, prompt: promptText, finalAnswer, changes, commands }).catch(() => ({ saved: false }));
}

function explainError(error: unknown): void {
  if (error instanceof ApiError) {
    if (error.code === "quota_exceeded") {
      const details = error.details as { remaining?: number; resetAt?: string } | undefined;
      console.error(`${c.red}Token limit reached.${c.reset} Remaining: ${details?.remaining ?? 0}. Reset: ${details?.resetAt ?? "soon"}.`);
      return;
    }
    if (error.status === 401) {
      console.error(`${c.red}Auth failed:${c.reset} ${error.code ?? "unknown"} - ${error.message}`);
      return;
    }
  }
  console.error(`${c.red}Error:${c.reset} ${error instanceof Error ? error.message : String(error)}`);
}

async function main(): Promise<void> {
  await ensureStorage();
  let config = await loadConfig();
  let auth = await loadAuth();
  if (auth && typeof auth.deviceToken !== "string") auth = null;

  const api = new VinnexxApi(config, auth);
  let workspace = resolve(config.workspace ?? paths.workspace);
  await mkdir(workspace, { recursive: true });
  process.chdir(workspace);

  banner(auth, config, workspace);
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });

  const confirmAction = async (question: string, defaultYes = false): Promise<boolean> => {
    const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
    const answer = (await rl.question(`${question}${suffix}`)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === "y" || answer === "yes";
  };

  try {
    while (true) {
      const input = (await rl.question(prompt(auth, workspace))).trim();
      if (!input) continue;

      try {
        if (input === "/exit") break;
        if (input === "/help") { printHelp(auth); continue; }
        if (input === "/clear") { banner(auth, config, workspace); continue; }

        if (input === "/login") {
          auth = await loginWithBrowser(api);
          api.setAuth(auth);
          config.workspace ??= paths.workspace;
          config.rootDir ??= paths.home;
          await mkdir(config.workspace, { recursive: true });
          await saveConfig(config);
          banner(auth, config, workspace);
          console.log(`${c.red}✓ Connected as ${auth.account.username}.${c.reset}`);
          continue;
        }

        if (input === "/setup" || input.startsWith("/setup ")) {
          const updated = await updateSetup(input, config, workspace, (question) => rl.question(question));
          config = updated.config;
          workspace = updated.workspace;
          continue;
        }

        if (!auth && !["/logout", "/model"].includes(input)) {
          console.log(`${c.yellow}Please login first using /login.${c.reset}`);
          continue;
        }

        if (input === "/logout") {
          if (auth) await api.revokeCurrentDevice().catch(() => ({ revoked: false }));
          await clearAuth();
          auth = null;
          api.setAuth(null);
          banner(auth, config, workspace);
          console.log(`${c.red}✓ Logged out on this device.${c.reset}`);
          continue;
        }

        if (input === "/model") {
          console.log(`\n${c.bold}Model${c.reset}\n  Public name : ${MODEL_NAME}\n  Developer   : Vinnexx\n  Mode        : Secure terminal coding assistant\n`);
          continue;
        }

        if (input === "/profile" || input === "/status") {
          auth = await ensureLoggedIn(api, auth);
          if (input === "/profile") await showProfile(api);
          else await showShortStatus(api);
          continue;
        }

        if (input.startsWith("/project")) {
          const target = input.slice("/project".length).trim();
          if (!target) { console.log(`${c.red}Current workspace:${c.reset} ${prettyPath(workspace)}`); continue; }
          const next = resolve(workspace, target);
          if (!(await ensureWorkspaceTrusted(next, config, confirmAction))) { console.log(`${c.yellow}Workspace not trusted.${c.reset}`); continue; }
          workspace = next;
          config.workspace = workspace;
          await saveConfig(config);
          await mkdir(next, { recursive: true });
          process.chdir(next);
          banner(auth, config, workspace);
          console.log(`${c.red}✓ Workspace changed:${c.reset} ${prettyPath(workspace)}`);
          continue;
        }

        if (input === "/undo") { console.log(await undoLastTask()); continue; }
        if (input === "/redo") { console.log(await redoLastTask()); continue; }

        if (input === "/memory") {
          auth = await ensureLoggedIn(api, auth);
          const memories = await api.listMemories();
          if (memories.length === 0) console.log(`${c.dim}No memories saved.${c.reset}`);
          else memories.forEach((item) => console.log(`${c.red}- ${item.key}:${c.reset} ${item.value}`));
          continue;
        }

        if (input.startsWith("/memory set ")) {
          auth = await ensureLoggedIn(api, auth);
          const rest = input.slice("/memory set ".length);
          const separator = rest.indexOf(" ");
          if (separator < 1) throw new Error("Usage: /memory set KEY VALUE");
          const key = rest.slice(0, separator);
          const value = rest.slice(separator + 1);
          await api.upsertMemory(key, value);
          console.log(`${c.red}✓ Memory '${key}' saved.${c.reset}`);
          continue;
        }

        if (input.startsWith("/")) { console.log(`${c.yellow}Unknown command. Use /help.${c.reset}`); continue; }
        if (handleLocalQuestion(input)) continue;
        if (input.length > MAX_DIRECT_PROMPT_CHARS) { await saveLongInput(workspace, input); continue; }

        auth = await ensureLoggedIn(api, auth);
        if (!(await ensureWorkspaceTrusted(workspace, config, confirmAction))) {
          console.log(`${c.yellow}The current workspace is not trusted. Use /project PATH.${c.reset}`);
          continue;
        }
        await runChat(api, input, workspace, confirmAction);
      } catch (error) {
        explainError(error);
      }
    }
  } finally {
    rl.close();
  }

  console.log(`${c.dim}Goodbye.${c.reset}`);
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(VERSION);
} else if (process.argv.includes("--help") || process.argv.includes("-h")) {
  banner(null);
  printHelp(null);
} else {
  void main().catch((error) => {
    explainError(error);
    process.exitCode = 1;
  });
}
