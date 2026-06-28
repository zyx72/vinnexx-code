import type { Screen } from "./screen.js";

export type InputSubmission = { text: string; displayText: string };

type PendingLine = {
  resolve: (value: InputSubmission) => void;
  reject: (error: Error) => void;
  label: string;
  buffer: string;
  cursor: number;
  payload: string | null;
  warning: string;
  historyIndex: number;
};

type PendingMenu = {
  resolve: (value: number | null) => void;
  title: string;
  items: string[];
  selected: number;
};

export class TerminalInput {
  private pendingLine: PendingLine | null = null;
  private pendingMenu: PendingMenu | null = null;
  private history: string[] = [];
  private queue = Promise.resolve();
  private started = false;

  constructor(
    private readonly screen: Screen,
    private readonly savePaste: (content: string) => Promise<string>,
    private readonly cancelTask: () => boolean
  ) {}

  start(): void {
    if (this.started || !this.screen.isTty) return;
    this.started = true;
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", this.onData);
    process.stdout.write("\x1b[?2004h");
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    process.stdin.off("data", this.onData);
    process.stdin.setRawMode?.(false);
    process.stdin.pause();
    process.stdout.write("\x1b[?2004l");
    this.pendingLine?.reject(new Error("Input closed."));
    this.pendingLine = null;
    this.pendingMenu?.resolve(null);
    this.pendingMenu = null;
  }

  async readLine(label = "›"): Promise<InputSubmission> {
    if (!this.screen.isTty) {
      const { createInterface } = await import("node:readline/promises");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const text = await rl.question(`${label} `);
        return { text, displayText: text };
      } finally {
        rl.close();
      }
    }
    if (this.pendingLine || this.pendingMenu) throw new Error("Input is already active.");
    return new Promise<InputSubmission>((resolve, reject) => {
      this.pendingLine = {
        resolve,
        reject,
        label,
        buffer: "",
        cursor: 0,
        payload: null,
        warning: "",
        historyIndex: this.history.length
      };
      this.paintLine();
    });
  }

  async select(title: string, items: string[], initial = 0): Promise<number | null> {
    if (!this.screen.isTty) return initial;
    if (this.pendingLine || this.pendingMenu) throw new Error("Input is already active.");
    return new Promise<number | null>((resolve) => {
      this.pendingMenu = { resolve, title, items, selected: Math.max(0, Math.min(items.length - 1, initial)) };
      this.paintMenu();
    });
  }

  private readonly onData = (chunk: string | Buffer): void => {
    const data = String(chunk);
    this.queue = this.queue.then(() => this.handleData(data)).catch(() => undefined);
  };

  private async handleData(data: string): Promise<void> {
    if (this.pendingMenu) {
      this.handleMenu(data);
      return;
    }
    const line = this.pendingLine;
    if (!line) {
      if (data === "\u0003") this.cancelTask();
      return;
    }

    const bracketed = data.match(/^\x1b\[200~([\s\S]*)\x1b\[201~$/);
    if (!bracketed && data.length > 1 && !data.startsWith("\x1b") && data.length <= 100) {
      for (const character of data) await this.handleData(character);
      return;
    }
    const paste = bracketed?.[1] ?? (data.length > 100 ? data : null);
    if (paste !== null && paste.length > 100) {
      const clean = paste.replace(/\x1b\[200~|\x1b\[201~/g, "");
      const reference = await this.savePaste(clean);
      line.payload = clean;
      line.buffer = reference;
      line.cursor = reference.length;
      line.warning = "Long paste stored securely and will be sent as this prompt.";
      this.paintLine();
      return;
    }

    if (data === "\u0003") {
      if (this.cancelTask()) {
        line.warning = "Active task cancelled.";
      } else {
        line.buffer = "";
        line.cursor = 0;
        line.payload = null;
      }
      this.paintLine();
      return;
    }
    if (data === "\u0004") return this.submit("/exit", "/exit");
    if (data === "\r" || data === "\n") {
      const display = line.buffer;
      return this.submit(line.payload ?? line.buffer, display);
    }
    if (data === "\x1b[5~") return this.screen.pageUp();
    if (data === "\x1b[6~") return this.screen.pageDown();
    if (data === "\x1b[D") line.cursor = Math.max(0, line.cursor - 1);
    else if (data === "\x1b[C") line.cursor = Math.min(line.buffer.length, line.cursor + 1);
    else if (data === "\x1b[H" || data === "\x1bOH") line.cursor = 0;
    else if (data === "\x1b[F" || data === "\x1bOF") line.cursor = line.buffer.length;
    else if (data === "\x7f" || data === "\b") {
      if (line.cursor > 0) {
        line.buffer = `${line.buffer.slice(0, line.cursor - 1)}${line.buffer.slice(line.cursor)}`;
        line.cursor -= 1;
        line.payload = null;
      }
    } else if (data === "\x1b[3~") {
      if (line.cursor < line.buffer.length) {
        line.buffer = `${line.buffer.slice(0, line.cursor)}${line.buffer.slice(line.cursor + 1)}`;
        line.payload = null;
      }
    } else if (data === "\x1b[A") {
      if (this.history.length > 0) {
        line.historyIndex = Math.max(0, line.historyIndex - 1);
        line.buffer = this.history[line.historyIndex] ?? "";
        line.cursor = line.buffer.length;
        line.payload = null;
      }
    } else if (data === "\x1b[B") {
      line.historyIndex = Math.min(this.history.length, line.historyIndex + 1);
      line.buffer = line.historyIndex === this.history.length ? "" : (this.history[line.historyIndex] ?? "");
      line.cursor = line.buffer.length;
      line.payload = null;
    } else if (!data.startsWith("\x1b") && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(data)) {
      line.buffer = `${line.buffer.slice(0, line.cursor)}${data}${line.buffer.slice(line.cursor)}`;
      line.cursor += data.length;
      line.payload = null;
      if (line.buffer.length > 100) line.warning = "Long prompt detected — use paste or an input file.";
    }
    this.paintLine();
  }

  private handleMenu(data: string): void {
    const menu = this.pendingMenu;
    if (!menu) return;
    if (data === "\x1b[A") menu.selected = (menu.selected - 1 + menu.items.length) % menu.items.length;
    else if (data === "\x1b[B") menu.selected = (menu.selected + 1) % menu.items.length;
    else if (data === "\r" || data === "\n") {
      this.pendingMenu = null;
      this.screen.setMenu(null);
      menu.resolve(menu.selected);
      return;
    } else if (data === "\x1b" || data === "\u0003") {
      this.pendingMenu = null;
      this.screen.setMenu(null);
      menu.resolve(null);
      return;
    }
    this.paintMenu();
  }

  private submit(text: string, displayText: string): void {
    const line = this.pendingLine;
    if (!line) return;
    this.pendingLine = null;
    if (displayText.trim() && displayText !== "/exit") {
      this.history.push(displayText);
      if (this.history.length > 100) this.history = this.history.slice(-100);
    }
    this.screen.setInput("›", "", 0);
    line.resolve({ text, displayText });
  }

  private paintLine(): void {
    const line = this.pendingLine;
    if (line) this.screen.setInput(line.label, line.buffer, line.cursor, line.warning);
  }

  private paintMenu(): void {
    const menu = this.pendingMenu;
    if (menu) this.screen.setMenu({ title: menu.title, items: menu.items, selected: menu.selected });
  }
}
