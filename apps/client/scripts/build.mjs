import { mkdir, rm, chmod } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/vinnexx.mjs",
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" }
});
await chmod("dist/vinnexx.mjs", 0o755);
console.log("Built dist/vinnexx.mjs");
