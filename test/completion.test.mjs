import test from "node:test";
import assert from "node:assert/strict";
import { renderBashCompletion, renderZshCompletion } from "../src/completion.mjs";

test("renderZshCompletion includes commands, presets, and @task file completion", () => {
  const script = renderZshCompletion();

  assert.match(script, /#compdef ccbridge/);
  assert.match(script, /completion:Print shell completion setup/);
  assert.match(script, /'balanced:/);
  assert.match(script, /compset -P '@'/);
  assert.match(script, /--task\[task text or @file\]/);
});

test("renderBashCompletion includes commands and @task file completion", () => {
  const script = renderBashCompletion();

  assert.match(script, /complete -F _ccbridge ccbridge/);
  assert.match(script, /run doctor presets completion setup answer resume continue/);
  assert.match(script, /COMPREPLY\+=\("@\$match"\)/);
  assert.match(script, /--task --task-file/);
});
