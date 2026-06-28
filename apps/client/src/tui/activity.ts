import { performance } from "node:perf_hooks";
import type { Screen } from "./screen.js";

export type ActivityStatus =
  | "READY" | "THINKING" | "PROCESSING" | "READING" | "WRITING" | "RUNNING"
  | "SEARCHING" | "REVIEWING" | "WAITING" | "SUCCESS" | "ERROR";

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export class ActivityController {
  private timer: NodeJS.Timeout | null = null;
  private startedAt = performance.now();
  private status: ActivityStatus = "READY";
  private detail = "Ready";
  private progress: number | undefined;

  constructor(private readonly screen: Screen) {}

  start(status: ActivityStatus, detail: string, progress?: number): void {
    this.clear();
    this.status = status;
    this.detail = detail;
    this.progress = progress;
    this.startedAt = performance.now();
    this.paint();
    this.timer = setInterval(() => this.paint(), 250);
    this.timer.unref?.();
  }

  update(status: ActivityStatus, detail: string, progress?: number): void {
    if (status !== this.status) this.startedAt = performance.now();
    this.status = status;
    this.detail = detail;
    this.progress = progress;
    this.paint();
  }

  finish(status: "READY" | "SUCCESS" | "ERROR" = "READY", detail = "Ready"): void {
    this.clear();
    this.status = status;
    this.detail = detail;
    this.progress = undefined;
    this.startedAt = performance.now();
    this.paint();
  }

  dispose(): void {
    this.clear();
  }

  private paint(): void {
    this.screen.setActivity({
      status: this.status,
      elapsed: elapsed(performance.now() - this.startedAt),
      detail: this.detail,
      ...(this.progress === undefined ? {} : { progress: this.progress })
    });
  }

  private clear(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
