import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  npm_config_global: "false",
  NPM_CONFIG_GLOBAL: "false"
};

function run(args) {
  const result = spawnSync(npm, args, {
    cwd: root,
    env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["ci", "--prefix", "apps/client", "--include=dev"]);
run(["run", "build", "--prefix", "apps/client"]);
