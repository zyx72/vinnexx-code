import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { ApiError, VinnexxApi } from "../api.js";
import { loginWithBrowser } from "../auth.js";
import { TaskHistory, redoLastTask, undoLastTask } from "../history.js";
import {
  clearAuth,
  ensureStorage,
  loadAuth,
  loadConfig,
  paths,
  saveConfig,
  saveLongText
} from "../storage.js";
import { executeToolCall, truncateToolOutput } from "../tools.js";
import type {
  Account,
  ChatResponse,
  ClientConfig,
  PublicModel,
  StoredAuth,
  ToolCall,
  ToolExecutionResult,
  UsageInfo
} from "../types.js";
import { PUBLIC_MODEL_NAMES } from "../types.js";
import { buildWorkspaceTree, ensureWorkspaceTrusted } from "../workspace.js";
import { ActivityController, type ActivityStatus } from "./activity.js";
import { TerminalInput } from "./input.js";
import { Screen } from "./screen.js";
import { runSetupMenu } from "./setup-menu.js";

const GUEST_COMMANDS = new Set(["/login", "/help", "/setup", "/clear", "/exit"]);

function commandName(input: string): string {
  return input.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
}

export function guestMayUse(input: string): boolean {
  return GUEST_COMMANDS.has(commandName(input));
}

export function parseModelCommand(input: string): PublicModel | null {
  const value = input.trim().split(/\s+/)[1]?.toLowerCase();
  if (!value) return null;
  if (value === "strummer" || value === "united") return value;
  throw new Error("Usage: /model strummer|united");
}

function toolStatus(call: ToolCall): ActivityStatus {
  if (call.name === "read_file" || call.name === "list_directory") return "READING";
  if (call.name === "write_file" || call.name === "edit_file" || call.name === "create_directory") return "WRITING";
  if (call.name === "run_command") return "RUNNING";
  return "PROCESSING";
}

export function localInternalAnswer(text: string, model: PublicModel): string | null {
  const normalized = text.trim().toLowerCase();
  if (/^(halo|hai|hi|hello|hey|pagi|siang|malam)[!. ]*$/.test(normalized)) {
    return `Halo. ${PUBLIC_MODEL_NAMES[model]} siap membantu di Vinnexx Code.`;
  }
  if (/(siapa kamu|model apa|nama kamu|identitas)/i.test(normalized)) {
    return `Saya ${PUBLIC_MODEL_NAMES[model]}, model publik di dalam Vinnexx Code.`;
  }
  if (/(cara keluar|how to exit|keluar dari vinnexx)/i.test(normalized)) return "Gunakan `/exit`.";
  if (/(akun|limit|quota|kuota)/i.test(normalized) && /(cek|lihat|berapa|status)/i.test(normalized)) {
    return "Gunakan `/profile` untuk melihat akun dan limit.";
  }
  if (/(setting|pengaturan|setup)/i.test(normalized)) return "Gunakan `/setup` atau `/setup edit`.";
  if (/(ganti|ubah).*(workspace|folder|project)/i.test(normalized)) return "Gunakan `/project PATH`.";
  return null;
}


export function shouldUseLocalReviewFallback(
  error: unknown,
  localToolSucceeded: boolean,
  localToolFailed: boolean
): boolean {
  return error instanceof ApiError &&
    (error.code === "request_timeout" || error.code === "review_timeout") &&
    localToolSucceeded &&
    !localToolFailed;
}

export function setupText(config: ClientConfig): string {
  return [
    "# Setup",
    `Language: ${config.language === "id" ? "Indonesian" : "English"}`,
    `Root directory: ${config.rootDir.replace("/storage/emulated/0", "/sdcard")}`,
    `Workspace: ${config.workspace.replace("/storage/emulated/0", "/sdcard")}`,
    `Selected model: ${PUBLIC_MODEL_NAMES[config.selectedPublicModel]}`
  ].join("\n");
}

export function profileText(account: Account, usage: UsageInfo, model: PublicModel): string {
  const reset = new Date(usage.resetAt);
  const remaining = usage.remaining ?? "unlimited";
  const limit = usage.limit ?? "unlimited";
  return [
    "# Profile",
    `Username: ${account.username}`,
    `Email: ${account.email}`,
    `Plan: ${account.plan}`,
    `Public model: ${PUBLIC_MODEL_NAMES[model]}`,
    `Remaining limit: ${remaining}`,
    `Total limit: ${limit}`,
    `Reset time: ${Number.isNaN(reset.getTime()) ? "unknown" : reset.toLocaleString()}`,
    `Account/device status: ${account.deviceStatus ?? "active"}`
  ].join("\n");
}

function helpText(loggedIn: boolean): string {
  const common = [
    "# Commands",
    "- `/login` connect account",
    "- `/help` show commands",
    "- `/setup` show local settings",
    "- `/setup edit` interactive settings",
    "- `/clear` clear conversation",
    "- `/exit` exit safely"
  ];
  if (loggedIn) common.splice(2, 0,
    "- `/logout` disconnect this device",
    "- `/profile` or `/status` account and usage",
    "- `/model [strummer|united]` switch public model",
    "- `/project PATH` switch trusted workspace",
    "- `/memory` or `/memory set KEY VALUE`",
    "- `/undo` and `/redo` local task history"
  );
  return common.join("\n");
}

export class VinnexxApp {
  private readonly screen = new Screen();
  private readonly activity = new ActivityController(this.screen);
  private readonly terminalInput = new TerminalInput(
    this.screen,
    async (content) => {
      const saved = await saveLongText(content);
      return `[longtext: ${saved.name}]`;
    },
    () => this.cancelActiveTask()
  );
  private config!: ClientConfig;
  private auth: StoredAuth | null = null;
  private api!: VinnexxApi;
  private running = false;
  private activeTask: AbortController | null = null;

  async initialize(): Promise<void> {
    await ensureStorage();
    this.config = await loadConfig();
    this.auth = await loadAuth();
    await mkdir(this.config.workspace, { recursive: true });
    this.config.workspace = await realpath(this.config.workspace).catch(() => resolve(this.config.workspace));
    process.chdir(this.config.workspace);
    this.api = new VinnexxApi(this.auth);
    this.screen.start(this.config, this.auth);
    this.terminalInput.start();
    this.screen.addMessage("system", this.auth
      ? `Signed in as ${this.auth.account.username}. Type /help for commands.`
      : "Guest mode. Please login first using /login.");
  }

  async run(): Promise<void> {
    this.running = true;
    while (this.running) {
      const submission = await this.terminalInput.readLine("›");
      const text = submission.text.trim();
      if (!text) continue;
      this.screen.addMessage("user", submission.displayText || text);
      try {
        await this.handleInput(text);
      } catch (error) {
        this.activity.finish("ERROR", "Operation failed");
        this.screen.addMessage("error", this.explainError(error));
      } finally {
        if (!this.activeTask) this.activity.finish("READY", "Ready");
      }
    }
  }

  async shutdown(): Promise<void> {
    this.running = false;
    this.activeTask?.abort();
    this.activeTask = null;
    this.activity.dispose();
    this.terminalInput.stop();
    this.screen.stop();
  }

  private cancelActiveTask(): boolean {
    if (!this.activeTask) return false;
    this.activeTask.abort(new DOMException("Cancelled by user", "AbortError"));
    this.activeTask = null;
    this.activity.finish("ERROR", "Task cancelled");
    return true;
  }

  private async handleInput(text: string): Promise<void> {
    const cmd = commandName(text);
    if (!this.auth && !guestMayUse(text)) {
      this.screen.addMessage("error", "Please login first using /login.");
      return;
    }

    if (!text.startsWith("/")) {
      const local = localInternalAnswer(text, this.config.selectedPublicModel);
      if (local) {
        this.screen.addMessage("assistant", local);
        return;
      }
      await this.runChat(text);
      return;
    }

    switch (cmd) {
      case "/exit":
        this.running = false;
        return;
      case "/help":
        this.screen.addMessage("system", helpText(Boolean(this.auth)));
        return;
      case "/clear":
        this.screen.clearMessages();
        return;
      case "/login":
        await this.login();
        return;
      case "/logout":
        await this.logout();
        return;
      case "/profile":
      case "/status":
        await this.profile();
        return;
      case "/setup":
        await this.setup(text);
        return;
      case "/model":
        await this.model(text);
        return;
      case "/project":
        await this.project(text);
        return;
      case "/memory":
        await this.memory(text);
        return;
      case "/undo":
        this.screen.addMessage("system", await undoLastTask());
        return;
      case "/redo":
        this.screen.addMessage("system", await redoLastTask());
        return;
      default:
        this.screen.addMessage("error", "Unknown command. Use /help.");
    }
  }

  private async login(): Promise<void> {
    if (this.auth) {
      this.screen.addMessage("system", `Already signed in as ${this.auth.account.username}.`);
      return;
    }
    const controller = new AbortController();
    this.activeTask = controller;
    this.activity.start("WAITING", "Connecting account");
    try {
      this.auth = await loginWithBrowser({
        api: this.api,
        signal: controller.signal,
        onInfo: (message) => this.screen.addMessage("system", message)
      });
      this.screen.setContext(this.config, this.config.workspace, this.auth);
      this.screen.addMessage("system", `Signed in as ${this.auth.account.username}.`);
    } finally {
      if (this.activeTask === controller) this.activeTask = null;
    }
  }

  private async logout(): Promise<void> {
    if (!this.auth) return;
    await this.api.revokeCurrentDevice().catch(() => ({ revoked: false }));
    await clearAuth();
    this.auth = null;
    this.api.setAuth(null);
    this.screen.setContext(this.config, this.config.workspace, null);
    this.screen.addMessage("system", "Signed out from this device.");
  }

  private async profile(): Promise<void> {
    const [account, usage] = await Promise.all([this.api.getAccount(), this.api.getUsage()]);
    this.screen.addMessage("system", profileText(account, usage, this.config.selectedPublicModel));
  }

  private async setup(text: string): Promise<void> {
    if (text.trim().toLowerCase() !== "/setup edit") {
      this.screen.addMessage("system", setupText(this.config));
      return;
    }
    const updated = await runSetupMenu({ config: this.config, screen: this.screen, terminalInput: this.terminalInput });
    this.config = updated;
    await saveConfig(this.config);
    await mkdir(this.config.workspace, { recursive: true });
    process.chdir(this.config.workspace);
    this.screen.setContext(this.config, this.config.workspace, this.auth);
    this.screen.addMessage("system", `Setup saved.\n\n${setupText(this.config)}`);
  }

  private async model(text: string): Promise<void> {
    const value = text.trim().split(/\s+/)[1]?.toLowerCase();
    if (!value) {
      this.screen.addMessage("system", `Active model: ${PUBLIC_MODEL_NAMES[this.config.selectedPublicModel]}\nUse /model strummer or /model united.`);
      return;
    }
    if (value !== "strummer" && value !== "united") throw new Error("Usage: /model strummer|united");
    this.config.selectedPublicModel = value;
    await saveConfig(this.config);
    this.screen.setContext(this.config, this.config.workspace, this.auth);
    this.screen.addMessage("system", `Model changed to ${PUBLIC_MODEL_NAMES[value]}.`);
  }

  private async project(text: string): Promise<void> {
    const raw = text.slice("/project".length).trim();
    if (!raw) {
      this.screen.addMessage("system", `Workspace: ${this.config.workspace}`);
      return;
    }
    const target = resolve(raw);
    await mkdir(target, { recursive: true });
    const normalized = await realpath(target);
    if (!await ensureWorkspaceTrusted(normalized, this.config, (question, defaultYes) => this.confirm(question, defaultYes))) {
      this.screen.addMessage("error", "Workspace was not trusted.");
      return;
    }
    this.config.workspace = normalized;
    await saveConfig(this.config);
    process.chdir(normalized);
    this.screen.setContext(this.config, normalized, this.auth);
    this.screen.addMessage("system", `Workspace changed to ${normalized}.`);
  }

  private async memory(text: string): Promise<void> {
    const rest = text.slice("/memory".length).trim();
    if (!rest) {
      const memories = await this.api.listMemories();
      this.screen.addMessage("system", memories.length
        ? memories.map((item) => `- \`${item.key}\`: ${item.value}`).join("\n")
        : "No synced memories.");
      return;
    }
    const match = rest.match(/^set\s+([A-Za-z0-9_.-]+)\s+([\s\S]+)$/);
    if (!match) throw new Error("Usage: /memory set KEY VALUE");
    await this.api.upsertMemory(match[1] ?? "", match[2] ?? "");
    this.screen.addMessage("system", `Memory ${match[1]} saved.`);
  }

  private async confirm(question: string, defaultYes = false): Promise<boolean> {
    this.screen.addMessage("system", question);
    const answer = await this.terminalInput.readLine(defaultYes ? "Y/n" : "y/N");
    const value = answer.text.trim().toLowerCase();
    if (!value) return defaultYes;
    return value === "y" || value === "yes";
  }

  private async runChat(promptText: string): Promise<void> {
    const controller = new AbortController();
    this.activeTask = controller;
    const requestId = randomUUID();
    const modelName = PUBLIC_MODEL_NAMES[this.config.selectedPublicModel];
    let history: TaskHistory | null = null;
    const commands: string[] = [];
    let finalAnswer = "";
    let response: ChatResponse;
    let localToolSucceeded = false;
    let localToolFailed = false;

    try {
      this.activity.start("THINKING", `Understanding request · ${modelName}`);
      const tree = await buildWorkspaceTree(this.config.workspace);
      response = await this.api.startChat({
        message: promptText,
        workspaceTree: tree,
        language: this.config.language,
        publicMode: this.config.selectedPublicModel,
        requestId,
        signal: controller.signal
      });

      let loop = 0;
      while (response.type === "tool_calls") {
        loop += 1;
        if (loop > 8) throw new Error("Tool loop limit reached after 8 rounds.");
        history ??= new TaskHistory(response.sessionId, this.config.workspace, promptText);
        const results: ToolExecutionResult[] = [];

        for (const [index, call] of response.calls.entries()) {
          const detailPath = String(call.arguments.path ?? call.arguments.command ?? call.name).slice(0, 90);
          this.activity.update(toolStatus(call), `${detailPath} · ${modelName}`, Math.round((index / Math.max(1, response.calls.length)) * 100));
          if (call.name === "run_command" && typeof call.arguments.command === "string") commands.push(call.arguments.command);
          const result = await executeToolCall({
            call,
            workspace: this.config.workspace,
            history,
            signal: controller.signal,
            onProcess: (message) => this.activity.update(toolStatus(call), message),
            confirmAction: (question, defaultYes) => this.confirm(question, defaultYes)
          });
          results.push({ ...result, output: truncateToolOutput(result.output) });
          localToolSucceeded ||= result.ok;
          localToolFailed ||= !result.ok;
        }

        this.activity.update("REVIEWING", `Checking ${results.length} tool result${results.length === 1 ? "" : "s"} · ${modelName}`);
        try {
          response = await this.api.continueChat({
            sessionId: response.sessionId,
            results,
            requestId: `${requestId}:${loop}`,
            signal: controller.signal
          });
        } catch (error) {
          if (shouldUseLocalReviewFallback(error, localToolSucceeded, localToolFailed)) {
            finalAnswer = "Local changes completed; final AI review timed out.";
            this.screen.addMessage("assistant", finalAnswer);
            const changes = history ? await history.finalize() : [];
            await this.api.completeTask({
              sessionId: response.sessionId,
              prompt: promptText,
              finalAnswer,
              changes,
              commands
            }).catch(() => ({ saved: false }));
            this.activity.finish("SUCCESS", "Local changes completed");
            return;
          }
          throw error;
        }
      }

      const reviewedAnswer = response.content.trim();
      finalAnswer = localToolFailed
        ? `One or more local tools failed. Treat this task as incomplete.${reviewedAnswer ? `\n\n${reviewedAnswer}` : ""}`
        : (reviewedAnswer || "Task completed.");
      this.screen.addMessage("assistant", finalAnswer);
      const changes = history ? await history.finalize() : [];
      await this.api.completeTask({
        sessionId: response.sessionId,
        prompt: promptText,
        finalAnswer,
        changes,
        commands
      }).catch(() => ({ saved: false }));
      this.activity.finish(localToolFailed ? "ERROR" : "SUCCESS", localToolFailed ? "Completed with tool errors" : "Task completed");
    } finally {
      if (this.activeTask === controller) this.activeTask = null;
    }
  }

  private explainError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "quota_exceeded") return "Usage limit reached. Check /profile for reset time.";
      if (error.code === "request_cancelled") return "Task cancelled.";
      if (error.code === "not_authenticated") return "Please login first using /login.";
      return error.message;
    }
    return error instanceof Error ? error.message : "Unexpected error.";
  }
}

export async function smokeState(): Promise<Record<string, unknown>> {
  await ensureStorage();
  const config = await loadConfig();
  return {
    version: "0.3.0",
    mode: "guest",
    workspace: config.workspace,
    model: PUBLIC_MODEL_NAMES[config.selectedPublicModel],
    settingsFile: paths.settings
  };
}
