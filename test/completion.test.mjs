import test from "node:test";
import assert from "node:assert/strict";
import { renderBashCompletion, renderZshCompletion } from "../src/completion.mjs";

test("renderZshCompletion includes commands, presets, and @task file completion", () => {
  const script = renderZshCompletion();

  assert.match(script, /#compdef ccbridge/);
  assert.match(script, /completion:Print shell completion setup/);
  assert.match(script, /'balanced:/);
  assert.match(script, /local prev_word="\$words\[CURRENT-1\]"/);
  assert.match(script, /case "\$words\[2\]:\$prev_word" in/);
  assert.match(script, /run:--preset\|doctor:--preset/);
  assert.match(script, /run:--task/);
  assert.match(script, /if compset -P '@'; then/);
  assert.match(script, /--task\[task text or @file\]/);
  assert.match(script, /_arguments -C -s/);
  assert.match(script, /case "\$state" in\s+preset\)/);
});

test("renderBashCompletion includes commands and @task file completion", () => {
  const script = renderBashCompletion();

  assert.match(script, /complete -F _ccbridge ccbridge/);
  assert.match(script, /run doctor presets completion setup answer resume continue/);
  assert.match(script, /COMPREPLY\+=\("@\$match"\)/);
  assert.match(script, /--task --task-file/);
});
