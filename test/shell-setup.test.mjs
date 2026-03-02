import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setupShellCompletion, upsertManagedBlock } from "../src/shell-setup.mjs";

test("upsertManagedBlock appends and replaces the managed completion block", () => {
  const block = ["# >>> ccbridge shell completion >>>", "line", "# <<< ccbridge shell completion <<<"].join(
    "\n"
  );

  const initial = upsertManagedBlock("export PATH=/usr/bin\n", block);
  assert.match(initial, /export PATH=\/usr\/bin/);
  assert.match(initial, /# >>> ccbridge shell completion >>>/);

  const replaced = upsertManagedBlock(
    "export PATH=/usr/bin\n# >>> ccbridge shell completion >>>\nold\n# <<< ccbridge shell completion <<<\n",
    block
  );
  assert.equal((replaced.match(/# >>> ccbridge shell completion >>>/g) ?? []).length, 1);
  assert.doesNotMatch(replaced, /\nold\n/);
});

test("setupShellCompletion writes zsh completion and rc snippet", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-shell-"));

  const result = await setupShellCompletion("zsh", { homeDir });

  const completionContent = await readFile(result.completionFile, "utf8");
  const rcContent = await readFile(result.rcFile, "utf8");

  assert.match(completionContent, /#compdef ccbridge/);
  assert.match(rcContent, /# >>> ccbridge shell completion >>>/);
  assert.match(rcContent, /\.zsh\/completions/);
});
