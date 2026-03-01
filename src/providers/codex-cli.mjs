import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseStructuredOutput, runCommand, writeSchemaFile } from "./cli-shared.mjs";

export class CodexCliProvider {
  constructor(config = {}) {
    this.command = config.command ?? "codex";
    this.model = config.model;
    this.sandbox = config.sandbox ?? "read-only";
    this.approvalPolicy = config.approvalPolicy ?? "never";
    this.skipGitRepoCheck = config.skipGitRepoCheck ?? false;
    this.fullAuto = config.fullAuto ?? false;
    this.additionalDirectories = config.additionalDirectories ?? [];
    this.extraArgs = config.extraArgs ?? [];
  }

  async run({ operation, prompt, schema, workspaceDir, runDir, roleName }) {
    const rawLogPrefix = `${roleName}-${operation}`;
    const schemaPath = await writeSchemaFile(runDir, rawLogPrefix, schema);
    const outputPath = path.join(runDir, "raw", `${rawLogPrefix}.result.json`);
    const args = [
      "--ask-for-approval",
      this.approvalPolicy,
      "exec",
      "--cd",
      workspaceDir,
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "--sandbox",
      this.sandbox,
      ...this.extraArgs
    ];

    if (this.model) {
      args.push("--model", this.model);
    }

    if (this.skipGitRepoCheck) {
      args.push("--skip-git-repo-check");
    }

    if (this.fullAuto) {
      args.push("--full-auto");
    }

    for (const directory of this.additionalDirectories) {
      args.push("--add-dir", directory);
    }

    const { stdout } = await runCommand({
      command: this.command,
      args,
      cwd: workspaceDir,
      stdinText: prompt,
      rawLogPrefix,
      runDir
    });

    const outputText = await readFile(outputPath, "utf8").catch(() => stdout);
    return parseStructuredOutput(outputText);
  }
}
