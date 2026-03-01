import { parseStructuredOutput, runCommand } from "./cli-shared.mjs";

export class ClaudeCliProvider {
  constructor(config = {}) {
    this.command = config.command ?? "claude";
    this.model = config.model;
    this.permissionMode = config.permissionMode ?? "dontAsk";
    this.outputFormat = config.outputFormat ?? "json";
    this.additionalDirectories = config.additionalDirectories ?? [];
    this.extraArgs = config.extraArgs ?? [];
  }

  async run({ operation, prompt, schema, workspaceDir, runDir, roleName }) {
    const args = [
      "--print",
      "--output-format",
      this.outputFormat,
      "--permission-mode",
      this.permissionMode,
      "--json-schema",
      JSON.stringify(schema),
      ...this.extraArgs
    ];

    if (this.model) {
      args.push("--model", this.model);
    }

    for (const directory of this.additionalDirectories) {
      args.push("--add-dir", directory);
    }

    args.push(prompt);

    const { stdout } = await runCommand({
      command: this.command,
      args,
      cwd: workspaceDir,
      rawLogPrefix: `${roleName}-${operation}`,
      runDir
    });

    return parseStructuredOutput(stdout);
  }
}
