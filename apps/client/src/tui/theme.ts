export const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  red: "\x1b[31m",
  brightRed: "\x1b[91m",
  white: "\x1b[97m",
  gray: "\x1b[90m",
  yellow: "\x1b[93m",
  green: "\x1b[92m",
  redBackground: "\x1b[41m",
  black: "\x1b[30m"
} as const;

export function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

export function clipPlain(value: string, width: number): string {
  if (width <= 0) return "";
  const plain = stripAnsi(value);
  if (plain.length <= width) return value;
  return `${plain.slice(0, Math.max(0, width - 1))}…`;
}

export function padPlain(value: string, width: number): string {
  const clipped = clipPlain(value, width);
  const length = stripAnsi(clipped).length;
  return `${clipped}${" ".repeat(Math.max(0, width - length))}`;
}
