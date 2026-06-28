import { VinnexxApp, smokeState } from "./tui/app.js";

const VERSION = "0.3.0";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}

if (process.argv.includes("--smoke")) {
  process.stdout.write(`${JSON.stringify(await smokeState())}\n`);
  process.exit(0);
}

const app = new VinnexxApp();
let shuttingDown = false;

async function shutdown(code = 0): Promise<never> {
  if (!shuttingDown) {
    shuttingDown = true;
    await app.shutdown().catch(() => undefined);
  }
  process.exit(code);
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));
process.once("uncaughtException", (error) => {
  process.stderr.write(`Vinnexx stopped after an unexpected error: ${error.message}\n`);
  void shutdown(1);
});
process.once("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : "Unhandled rejection";
  process.stderr.write(`Vinnexx stopped after an unexpected error: ${message}\n`);
  void shutdown(1);
});

try {
  await app.initialize();
  await app.run();
  await shutdown(0);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Vinnexx failed to start."}\n`);
  await shutdown(1);
}
