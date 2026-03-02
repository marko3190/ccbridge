import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs, resolveTask } from "../src/cli.mjs";

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
