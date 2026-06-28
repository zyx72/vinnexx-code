import type { ClientConfig, StoredAuth } from "../types.js";
import { PUBLIC_MODEL_NAMES } from "../types.js";
import { renderMarkdown } from "./markdown.js";
import { ansi, padPlain } from "./theme.js";

export type ActivityView = {
  status: string;
  elapsed: string;
  detail: string;
  progress?: number;
};

type Message = { role: "user" | "assistant" | "system" | "error"; text: string };
type MenuState = { title: string; items: string[]; selected: number } | null;

function prettyPath(path: string): string {
  return path.replace("/storage/emulated/0", "/sdcard");
}

export class Screen {
  private readonly tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  private messages: Message[] = [];
  private auth: StoredAuth | null = null;
  private config!: ClientConfig;
  private workspace = "";
  private activity: ActivityView = { status: "READY", elapsed: "00:00", detail: "Ready" };
  private inputLabel = "›";
  private inputText = "";
  private inputCursor = 0;
  private warning = "";
  private scrollOffset = 0;
  private menu: MenuState = null;
  private started = false;

  get isTty(): boolean {
    return this.tty;
  }

  start(config: ClientConfig, auth: StoredAuth | null): void {
    this.config = config;
    this.workspace = config.workspace;
    this.auth = auth;
    this.started = true;
    if (this.tty) {
      process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H");
      process.stdout.on("resize", this.render);
    }
    this.render();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.tty) {
      process.stdout.off("resize", this.render);
      process.stdout.write("\x1b[?25h\x1b[0m\x1b[?1049l");
    }
  }

  setContext(config: ClientConfig, workspace: string, auth: StoredAuth | null): void {
    this.config = config;
    this.workspace = workspace;
    this.auth = auth;
    this.render();
  }

  setActivity(activity: ActivityView): void {
    this.activity = activity;
    this.render();
  }

  setInput(label: string, text: string, cursor: number, warning = ""): void {
    this.inputLabel = label;
    this.inputText = text;
    this.inputCursor = cursor;
    this.warning = warning;
    this.render();
  }

  setMenu(menu: MenuState): void {
    this.menu = menu;
    this.render();
  }

  addMessage(role: Message["role"], text: string): void {
    this.messages.push({ role, text });
    if (this.messages.length > 500) this.messages = this.messages.slice(-500);
    this.scrollOffset = 0;
    if (!this.tty) {
      const prefix = role === "user" ? "You" : role === "assistant" ? "Vinnexx" : role === "error" ? "Error" : "Info";
      process.stdout.write(`\n${prefix}: ${text}\n`);
    }
    this.render();
  }

  clearMessages(): void {
    this.messages = [];
    this.scrollOffset = 0;
    this.render();
  }

  pageUp(): void {
    this.scrollOffset += Math.max(3, Math.floor((process.stdout.rows || 24) / 2));
    this.render();
  }

  pageDown(): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - Math.max(3, Math.floor((process.stdout.rows || 24) / 2)));
    this.render();
  }

  private header(width: number): string[] {
    const account = this.auth ? `signed in as ${this.auth.account.username}` : "guest";
    const model = PUBLIC_MODEL_NAMES[this.config.selectedPublicModel];
    return [
      `${ansi.brightRed}${ansi.bold}██╗   ██╗██╗███╗ ██╗███╗ ██╗███████╗██╗  ██╗██╗  ██╗${ansi.reset}`,
      `${ansi.brightRed}${ansi.bold}██║   ██║██║████╗██║████╗██║██╔════╝╚██╗██╔╝╚██╗██╔╝${ansi.reset}`,
      `${ansi.brightRed}${ansi.bold}╚████╔╝ ██║██║╚███║██║╚███║███████╗██╔╝ ██╗██╔╝ ██╗${ansi.reset}`,
      `${ansi.bold}Vinnexx Code v0.3.0${ansi.reset} · ${account} · ${model}`,
      `${ansi.dim}root ${prettyPath(this.config.rootDir)}${ansi.reset}`,
      `${ansi.dim}workspace ${prettyPath(this.workspace)}${ansi.reset}`,
      `${ansi.red}${"─".repeat(width)}${ansi.reset}`
    ].map((line) => padPlain(line, width));
  }

  private conversation(width: number): string[] {
    const lines: string[] = [];
    for (const message of this.messages) {
      const label = message.role === "user" ? "YOU" : message.role === "assistant" ? PUBLIC_MODEL_NAMES[this.config.selectedPublicModel] : message.role === "error" ? "ERROR" : "VINNEXX";
      const color = message.role === "error" ? ansi.brightRed : message.role === "user" ? ansi.white : ansi.red;
      lines.push(`${color}${ansi.bold}${label}${ansi.reset}`);
      lines.push(...renderMarkdown(message.text, Math.max(20, width - 2)).map((line) => `  ${line}`));
      lines.push("");
    }
    if (this.menu) {
      lines.push(`${ansi.brightRed}${ansi.bold}${this.menu.title}${ansi.reset}`);
      for (const [index, item] of this.menu.items.entries()) {
        const selected = index === this.menu.selected;
        lines.push(selected
          ? `${ansi.redBackground}${ansi.white}${ansi.bold} ➜ ${item} ${ansi.reset}`
          : `   ${item}`);
      }
      lines.push(`${ansi.dim}↑/↓ navigate · Enter select · Esc back${ansi.reset}`);
    }
    return lines;
  }

  readonly render = (): void => {
    if (!this.started || !this.tty) return;
    const width = Math.max(40, process.stdout.columns || 80);
    const height = Math.max(16, process.stdout.rows || 24);
    const header = this.header(width);
    const footerHeight = 4;
    const bodyHeight = Math.max(3, height - header.length - footerHeight);
    const all = this.conversation(width);
    const maxOffset = Math.max(0, all.length - bodyHeight);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    const end = Math.max(0, all.length - this.scrollOffset);
    const start = Math.max(0, end - bodyHeight);
    const body = all.slice(start, end);
    while (body.length < bodyHeight) body.unshift("");

    const progress = this.activity.progress === undefined ? "" : ` · ${this.activity.progress}%`;
    const status = `${ansi.brightRed}${ansi.bold}${this.activity.status}${ansi.reset} ${this.activity.elapsed} · ${this.activity.detail}${progress}`;
    const warning = this.warning ? `${ansi.yellow}${this.warning}${ansi.reset}` : `${ansi.dim}PgUp/PgDn scroll · Ctrl+C cancel · Ctrl+D exit${ansi.reset}`;
    const inputPrefix = `${ansi.brightRed}${this.inputLabel}${ansi.reset} `;
    const input = `${inputPrefix}${this.inputText}`;

    const rows = [
      ...header,
      ...body.map((line) => padPlain(line, width)),
      padPlain(`${ansi.red}${"─".repeat(width)}${ansi.reset}`, width),
      padPlain(status, width),
      padPlain(input, width),
      padPlain(warning, width)
    ];
    process.stdout.write(`\x1b[?25l\x1b[H${rows.join("\n")}`);
    const inputRow = header.length + bodyHeight + 3;
    const cursorColumn = Math.min(width, 3 + this.inputCursor);
    process.stdout.write(`\x1b[${inputRow};${cursorColumn}H\x1b[?25h`);
  };
}
