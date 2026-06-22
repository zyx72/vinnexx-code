import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const release = resolve(root, "release");
const archiveName = "vinnexx-code-v0.2.0-source.zip";
const archive = resolve(release, archiveName);
const checksum = `${archive}.sha256`;
const temp = await mkdtemp(join(tmpdir(), "vinnexx-source-"));
const stageName = "vinnexx-code-v0.2.0";
const stage = join(temp, stageName);

const excludedSegments = new Set(["node_modules", ".git", ".vercel"]);
function filter(source) {
  const rel = relative(root, source);
  if (!rel) return true;
  const segments = rel.split(/[\\/]/);
  if (segments.some((segment) => excludedSegments.has(segment))) return false;
  const name = basename(source);
  if (name === ".env" || name.endsWith(".log")) return false;
  if (name === archiveName || name === `${archiveName}.sha256`) return false;
  return true;
}

await mkdir(release, { recursive: true });
await rm(archive, { force: true });
await rm(checksum, { force: true });
await cp(root, stage, { recursive: true, filter });
execFileSync("zip", ["-qr", archive, stageName], { cwd: temp, stdio: "inherit" });
const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
await writeFile(checksum, `${digest}  ${archiveName}\n`, "utf8");
await rm(temp, { recursive: true, force: true });
console.log(`Created ${archive} and ${checksum}`);
