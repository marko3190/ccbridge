import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs, resolveTask } from "../src/cli.mjs";

const execFile = promisify(execFileCallback);

test("parseArgs rejects missing values for paired options", () => {
  assert.throws(
    () => parseArgs(["node", "cli.mjs", "run", "--config"]),
    /--config requires a value/
  );
});

test("parseArgs rejects invalid numeric option values", () => {
  assert.throws(
    () => parseArgs(["node", "cli.mjs", "run", "--max-rounds", "abc"]),
    /--max-rounds requires a non-negative integer/
  );
});

test("parseArgs supports completion shell selection", () => {
  const args = parseArgs(["node", "cli.mjs", "completion", "zsh"]);

  assert.equal(args.command, "completion");
  assert.equal(args.shell, "zsh");
});

test("parseArgs supports analyze and ask specific options", () => {
  const analyzeArgs = parseArgs([
    "node",
    "cli.mjs",
    "analyze",
    "--task",
    "@task.md",
    "--preset",
    "balanced"
  ]);
  const askArgs = parseArgs([
    "node",
    "cli.mjs",
    "ask",
    "--run",
    "run-123",
    "--question",
    "What else should we verify?"
  ]);
  const fromAnalysisArgs = parseArgs([
    "node",
    "cli.mjs",
    "run",
    "--from-analysis",
    "run-123",
    "--task",
    "@task.md"
  ]);

  assert.equal(analyzeArgs.command, "analyze");
  assert.equal(analyzeArgs.task, "@task.md");
  assert.equal(askArgs.command, "ask");
  assert.equal(askArgs.question, "What else should we verify?");
  assert.equal(fromAnalysisArgs.fromAnalysis, "run-123");
});

test("parseArgs supports version flags", () => {
  const shortArgs = parseArgs(["node", "cli.mjs", "-v"]);
  const longArgs = parseArgs(["node", "cli.mjs", "--version"]);

  assert.equal(shortArgs.version, true);
  assert.equal(shortArgs.command, null);
  assert.equal(longArgs.version, true);
  assert.equal(longArgs.command, null);
});

test("setup command is accepted and configures shell completion", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-home-"));
  const cliPath = path.resolve("src/cli.mjs");

  const result = await execFile(process.execPath, [cliPath, "setup", "zsh"], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      HOME: homeDir,
      CCBRIDGE_SKIP_UPDATE_CHECK: "1"
    }
  });

  assert.match(result.stdout, /Configured zsh completion for ccbridge/);
});

test("cli runs correctly when invoked through a symlink", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-link-"));
  const linkedCliPath = path.join(tempDir, "ccbridge");
  await symlink(path.resolve("src/cli.mjs"), linkedCliPath);

  const result = await execFile(process.execPath, [linkedCliPath, "--help"], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      CCBRIDGE_SKIP_UPDATE_CHECK: "1"
    }
  });

  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /ccbridge setup zsh/);
});

test("cli prints version when invoked through a symlink", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-link-"));
  const linkedCliPath = path.join(tempDir, "ccbridge");
  await symlink(path.resolve("src/cli.mjs"), linkedCliPath);

  const result = await execFile(process.execPath, [linkedCliPath, "--version"], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      CCBRIDGE_SKIP_UPDATE_CHECK: "1"
    }
  });

  assert.match(result.stdout, /^v\d+\.\d+\.\d+\n$/);
});

test("resolveTask loads @file aliases from disk", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-task-"));
  const taskPath = path.join(baseDir, "task.md");
  await writeFile(taskPath, "Task from file\n", "utf8");

  const task = await resolveTask({
    task: `@${taskPath}`
  });

  assert.equal(task, "Task from file\n");
});

test("resolveTask supports escaping literal @ with @@ prefix", async () => {
  const task = await resolveTask({
    task: "@@mention this literally"
  });

  assert.equal(task, "@mention this literally");
});

test("resolveTask rejects bare @ task aliases without a file path", async () => {
  await assert.rejects(
    () =>
      resolveTask({
        task: "@"
      }),
    /--task @ requires a file path after @/
  );
});
