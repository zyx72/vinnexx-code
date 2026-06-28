import { ansi } from "./theme.js";

function inline(value: string): string {
  return value
    .replace(/`([^`]+)`/g, `${ansi.redBackground}${ansi.white} $1 ${ansi.reset}`)
    .replace(/\*\*\*([^*]+)\*\*\*/g, `${ansi.bold}${ansi.italic}$1${ansi.reset}`)
    .replace(/___([^_]+)___/g, `${ansi.bold}${ansi.italic}$1${ansi.reset}`)
    .replace(/\*\*([^*]+)\*\*/g, `${ansi.bold}$1${ansi.reset}`)
    .replace(/__([^_]+)__/g, `${ansi.bold}$1${ansi.reset}`)
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, `${ansi.italic}$1${ansi.reset}`)
    .replace(/(?<!_)_([^_]+)_(?!_)/g, `${ansi.italic}$1${ansi.reset}`);
}

function wrap(value: string, width: number): string[] {
  if (value.length <= width) return [value];
  const output: string[] = [];
  let rest = value;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < Math.floor(width * 0.45)) cut = width;
    output.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  output.push(rest);
  return output;
}

export function renderMarkdown(text: string, width: number): string[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const output: string[] = [];
  let inCode = false;
  let inTree = false;

  for (const raw of lines) {
    if (/^```/.test(raw)) {
      inCode = !inCode;
      output.push(`${ansi.dim}${"─".repeat(Math.max(3, Math.min(width, 60)))}${ansi.reset}`);
      continue;
    }
    if (raw.trim() === ":::tree") {
      inTree = true;
      continue;
    }
    if (inTree && raw.trim() === ":::") {
      inTree = false;
      continue;
    }
    if (inCode || inTree) {
      output.push(`${ansi.gray}│${ansi.reset} ${raw}`);
      continue;
    }

    const heading = raw.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const textValue = heading[2] ?? "";
      output.push(`${ansi.brightRed}${ansi.bold}${inline(textValue)}${ansi.reset}`);
      continue;
    }

    const bullet = raw.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      for (const [index, part] of wrap(bullet[1] ?? "", Math.max(8, width - 4)).entries()) {
        output.push(index === 0 ? `${ansi.brightRed}•${ansi.reset} ${inline(part)}` : `  ${inline(part)}`);
      }
      continue;
    }

    const numbered = raw.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      const marker = `${numbered[1]}.`;
      for (const [index, part] of wrap(numbered[2] ?? "", Math.max(8, width - marker.length - 1)).entries()) {
        output.push(index === 0 ? `${ansi.brightRed}${marker}${ansi.reset} ${inline(part)}` : `${" ".repeat(marker.length + 1)}${inline(part)}`);
      }
      continue;
    }

    const quote = raw.match(/^>\s?(.*)$/);
    if (quote) {
      output.push(`${ansi.red}│${ansi.reset} ${ansi.dim}${inline(quote[1] ?? "")}${ansi.reset}`);
      continue;
    }

    if (!raw) {
      output.push("");
      continue;
    }
    output.push(...wrap(raw, Math.max(8, width)).map(inline));
  }
  return output;
}
