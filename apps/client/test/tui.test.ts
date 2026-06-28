import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/tui/markdown.js";
import { truncateToolOutput } from "../src/tools.js";
import { PUBLIC_MODEL_NAMES } from "../src/types.js";

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

describe("Vinnexx 0.3 terminal behavior", () => {
  it("exposes only the two public model names", () => {
    expect(PUBLIC_MODEL_NAMES).toEqual({ strummer: "Strummer0.5", united: "United0.5" });
  });

  it("renders common terminal markdown", () => {
    const output = renderMarkdown("# Header\n- item\n> quote\n`code`", 60).map(stripAnsi).join("\n");
    expect(output).toContain("Header");
    expect(output).toContain("• item");
    expect(output).toContain("│ quote");
    expect(output).toContain(" code ");
  });

  it("keeps the head and tail when tool output is truncated", () => {
    const value = `HEAD-${"x".repeat(40_000)}-TAIL`;
    const result = truncateToolOutput(value);
    expect(result.length).toBeLessThanOrEqual(30_100);
    expect(result).toContain("HEAD-");
    expect(result).toContain("-TAIL");
    expect(result).toContain("omitted");
  });
});
