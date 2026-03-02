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
