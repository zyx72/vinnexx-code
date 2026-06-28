import { readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", ".next", ".cache", ".vercel", "coverage", "release"]);
const ignoredFiles = new Set(["package-lock.json"]);
const forbidden = [
  ["So", "ra0.5"].join(""),
  ["Cos", "mic0.1"].join(""),
  ["Nemo", "tron"].join(""),
  ["Open", "Router"].join(""),
  ["Pu", "ter"].join(""),
  ["api-vinnexx", ".zone.id"].join(""),
  ["OPEN", "ROUTER_API_KEY"].join(""),
  ["cohere/", "north-mini-code:free"].join("")
];
const sensitiveFile = /(^|\/)(\.env($|\.)|[^/]+\.(pem|key|p12|pfx)|credentials?\.json|secrets?\.json)$/i;
const likelyCredential = /(sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~-]{20,}|mongodb(?:\+srv)?:\/\/[^\s:@]+:[^\s@]+@)/i;
const findings = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const full = resolve(directory, entry.name);
    const rel = relative(root, full).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;
    if (sensitiveFile.test(rel) && basename(full) !== ".env.example") {
      findings.push(`${rel}: forbidden sensitive file type`);
      continue;
    }
    const info = await stat(full);
    if (info.size > 2_000_000) continue;
    const buffer = await readFile(full);
    if (buffer.subarray(0, 8_192).includes(0)) continue;
    const text = buffer.toString("utf8");
    for (const value of forbidden) {
      if (text.includes(value)) findings.push(`${rel}: forbidden legacy/internal string`);
    }
    if (likelyCredential.test(text)) findings.push(`${rel}: possible embedded credential`);
  }
}

await walk(root);
if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log("[>_] Source security scan passed.");
