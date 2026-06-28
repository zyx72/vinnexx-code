import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const release = resolve(root, "release");
const stage = resolve(release, "vinnexx-code");
await rm(release, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(resolve(root, "apps/client/dist"), resolve(stage, "client"), { recursive: true });
for (const file of ["readme.md", "CHANGELOG-0.3.md", "SECURITY.md"]) {
  await cp(resolve(root, file), resolve(stage, file));
}
await writeFile(resolve(stage, "VERSION"), "0.3.0\n", "utf8");
execFileSync("zip", ["-qr", resolve(release, "vinnexx-code.zip"), "vinnexx-code"], { cwd: release });
const archive = resolve(release, "vinnexx-code.zip");
const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
await writeFile(`${archive}.sha256`, `${digest}  vinnexx-code.zip\n`, "utf8");
console.log(`Created ${archive}`);
