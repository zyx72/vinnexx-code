import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const apiBase = (process.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });
await cp("index.html", "dist/index.html");
await writeFile("dist/config.js", `globalThis.__VINNEXX_API_BASE__ = ${JSON.stringify(apiBase)};\n`, "utf8");
await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  outfile: "dist/assets/app.js",
  sourcemap: true,
  minify: true,
  define: { "process.env.NODE_ENV": "\"production\"" }
});
console.log(`Built dashboard for API ${apiBase}`);
