import { performance } from "node:perf_hooks";

const supportsAnsi = Boolean(process.stdout.isTTY);

export type StatusMode =
  | "thinking"
  | "working"
  | "reviewing"
  | "waiting"
  | "success"
  | "error";

function formatElapsed(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return "0s";
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function labelForMode(mode: StatusMode): string {
  switch (mode) {
    case "thinking":
      return "THINKING";
    case "working":
      return "PROCESS";
    case "reviewing":
      return "REVIEW";
    case "waiting":
      return "WAITING";
    case "success":
      return "READY";
    case "error":
      return "ERROR";
  }
}

function colorForMode(mode: StatusMode): string {
  switch (mode) {
    case "thinking":
      return "\x1b[91m";
    case "working":
      return "\x1b[31m";
    case "reviewing":
      return "\x1b[95m";
    case "waiting":
      return "\x1b[93m";
    case "success":
      return "\x1b[92m";
    case "error":
      return "\x1b[91m";
  }
}

export class LiveStatus {
  private startedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private mode: StatusMode = "thinking";
  private progress = 0;
  private processText = "Processing...";
  private detailText = "";
  private rendered = false;

  start(mode: StatusMode, processText: string, detailText = ""): void {
    this.clearTimer();

    this.mode = mode;
    this.progress = 0;
    this.processText = processText;
    this.detailText = detailText;
    this.startedAt = performance.now();
    this.rendered = false;

    this.render();

    this.timer = setInterval(() => {
      this.render();
    }, 250);

    this.timer.unref?.();
  }

  updateProcess(processText: string, detailText?: string): void {
    this.processText = processText;

    if (detailText !== undefined) {
      this.detailText = detailText;
    }

    this.render();
  }

  updateDetail(detailText: string): void {
    this.detailText = detailText;
    this.render();
  }

  setProgress(progress: number): void {
    this.progress = Math.max(0, Math.min(100, Math.round(progress)));
    this.render();
  }

  switchMode(
    mode: StatusMode,
    processText?: string,
    detailText?: string
  ): void {
    this.mode = mode;
    this.startedAt = performance.now();
    this.progress = 0;

    if (processText !== undefined) {
      this.processText = processText;
    }

    if (detailText !== undefined) {
      this.detailText = detailText;
    }

    this.render();
  }

  stop(printFinal = true): void {
    this.clearTimer();

    if (!this.rendered) {
      return;
    }

    if (supportsAnsi) {
      process.stdout.write(
        "\r\x1b[2K" +
          "\x1b[1A\r\x1b[2K"
      );
    }

    if (printFinal) {
      process.stdout.write("\n");
    }

    this.rendered = false;
  }

  succeed(message = "Task completed."): void {
    this.switchMode("success", message);
    this.render();
    this.clearTimer();
  }

  fail(message = "Task failed."): void {
    this.switchMode("error", message);
    this.render();
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private render(): void {
    if (this.startedAt <= 0) {
      this.startedAt = performance.now();
    }

    const elapsed = formatElapsed(performance.now() - this.startedAt);
    const label = labelForMode(this.mode);
    const color = colorForMode(this.mode);
    const reset = "\x1b[0m";
    const dim = "\x1b[2m";

    const progress =
      this.mode === "working" && this.progress > 0
        ? ` ${this.progress}% ${this.bar(this.progress)}`
        : "";

    const statusLine = supportsAnsi
      ? `${color}${label.padEnd(8)}${reset} ${dim}${elapsed.padEnd(10)}${reset} ${this.processText}${progress}`
      : `${label} ${elapsed} ${this.processText}${progress}`;

    const detail = this.detailText || this.defaultDetail();
    const detailLine = supportsAnsi
      ? `${dim}└─ ${detail}${reset}`
      : `└─ ${detail}`;

    if (!supportsAnsi) {
      if (!this.rendered) {
        process.stdout.write(`${statusLine}\n${detailLine}\n`);
      }

      this.rendered = true;
      return;
    }

    if (!this.rendered) {
      process.stdout.write(`${statusLine}\n${detailLine}`);
      this.rendered = true;
      return;
    }

    process.stdout.write(
      `\x1b[1A\r\x1b[2K${statusLine}` +
        `\x1b[1B\r\x1b[2K${detailLine}`
    );
  }

  private defaultDetail(): string {
    switch (this.mode) {
      case "thinking":
        return "Understanding the request";
      case "working":
        return "Running local workspace tools";
      case "reviewing":
        return "Sending tool results back to Cosmic0.1";
      case "waiting":
        return "Waiting for a response";
      case "success":
        return "Ready for the next command";
      case "error":
        return "The operation did not complete";
    }
  }

  private bar(progress: number): string {
    const width = 16;
    const filled = Math.round((progress / 100) * width);

    return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
  }
}
