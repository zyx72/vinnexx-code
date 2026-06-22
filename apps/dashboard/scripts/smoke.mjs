import { access, readFile } from "node:fs/promises";
await access("dist/index.html");
await access("dist/assets/app.js");
await access("dist/config.js");
const html = await readFile("dist/index.html", "utf8");
if (!html.includes("/config.js") || !html.includes("/assets/app.js")) throw new Error("Dashboard output is incomplete.");
console.log("Dashboard smoke test passed.");
