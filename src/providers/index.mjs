import { ClaudeCliProvider } from "./claude-cli.mjs";
import { CodexCliProvider } from "./codex-cli.mjs";
import { MockProvider } from "./mock.mjs";

export function createProvider(config = {}) {
  switch (config.provider) {
    case "claude-cli":
      return new ClaudeCliProvider(config);
    case "codex-cli":
      return new CodexCliProvider(config);
    case "mock":
      return new MockProvider(config);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
