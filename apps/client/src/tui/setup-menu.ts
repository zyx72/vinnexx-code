import { mkdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import type { ClientConfig, PublicModel } from "../types.js";
import type { Screen } from "./screen.js";
import type { TerminalInput } from "./input.js";

export async function runSetupMenu(input: {
  config: ClientConfig;
  screen: Screen;
  terminalInput: TerminalInput;
}): Promise<ClientConfig> {
  const { screen, terminalInput } = input;
  const config = { ...input.config, trustedWorkspaces: [...input.config.trustedWorkspaces] };
  const items = ["Language", "Root directory", "Workspace", "Selected model", "Done"];

  while (true) {
    const selected = await terminalInput.select("Setup", items);
    if (selected === null || selected === 4) return config;
    if (selected === 0) {
      const choice = await terminalInput.select("Language", ["English", "Indonesian"], config.language === "id" ? 1 : 0);
      if (choice !== null) config.language = choice === 1 ? "id" : "en";
    } else if (selected === 1 || selected === 2) {
      const field = selected === 1 ? "rootDir" : "workspace";
      const current = config[field];
      screen.addMessage("system", `Current ${selected === 1 ? "root directory" : "workspace"}: ${current}`);
      const answer = await terminalInput.readLine("path");
      if (!answer.text.trim()) continue;
      const target = resolve(answer.text.trim());
      await mkdir(target, { recursive: true });
      const normalized = await realpath(target);
      config[field] = normalized;
      if (field === "workspace" && !config.trustedWorkspaces.includes(normalized)) {
        config.trustedWorkspaces.push(normalized);
      }
    } else if (selected === 3) {
      const models = ["Strummer0.5 — coding", "United0.5 — automation"];
      const choice = await terminalInput.select("Selected model", models, config.selectedPublicModel === "united" ? 1 : 0);
      if (choice !== null) config.selectedPublicModel = (choice === 1 ? "united" : "strummer") as PublicModel;
    }
  }
}
