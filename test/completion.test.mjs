import test from "node:test";
import assert from "node:assert/strict";
import { renderBashCompletion, renderZshCompletion } from "../src/completion.mjs";

test("renderZshCompletion includes commands, presets, and @task file completion", () => {
  const script = renderZshCompletion();

  assert.match(script, /#compdef ccbridge/);
  assert.match(script, /version:Show the installed ccbridge version/);
  assert.match(script, /analyze:Run a collaborative analysis without editing files/);
  assert.match(script, /ask:Add a follow-up question to a completed analysis run/);
  assert.match(script, /completion:Print shell completion setup/);
  assert.match(script, /'balanced:/);
  assert.match(script, /local prev_word="\$words\[CURRENT-1\]"/);
  assert.match(script, /case "\$words\[2\]:\$prev_word" in/);
  assert.match(script, /run:--preset\|analyze:--preset\|doctor:--preset/);
  assert.match(script, /run:--task\|analyze:--task/);
  assert.match(script, /run:--config\|run:--task-file\|analyze:--config\|analyze:--task-file\|doctor:--config\|answer:--answers-file\|ask:--question-file/);
  assert.match(script, /run:--workspace\|run:--artifacts\|run:--from-analysis\|analyze:--workspace\|analyze:--artifacts\|answer:--run\|ask:--run\|resume:--run\|continue:--run/);
  assert.match(script, /completion:completion\|setup:setup/);
  assert.match(script, /if compset -P '@'; then/);
  assert.match(script, /--task\[task text or @file\]/);
  assert.match(script, /--from-analysis\[reuse a completed analysis run\]/);
  assert.match(script, /ask\)\s+_arguments -s/);
  assert.match(script, /'\(-v --version\)'\{-v,--version\}'\[show the installed version\]'/);
  assert.match(script, /'\(-h --help\)'\{-h,--help\}'\[show this help\]'/);
  assert.match(script, /resume\|continue\)\s+_arguments -s/);
  assert.match(script, /_arguments -C -s/);
  assert.match(script, /case "\$state" in\s+preset\)/);
});

test("renderBashCompletion includes commands and @task file completion", () => {
  const script = renderBashCompletion();

  assert.match(script, /complete -F _ccbridge ccbridge/);
  assert.match(script, /version analyze run doctor presets completion setup ask answer resume continue -h --help -v --version/);
  assert.match(script, /COMPREPLY\+=\("@\$match"\)/);
  assert.match(script, /--from-analysis --task --task-file/);
  assert.match(script, /--run --question --question-file --json --verbose/);
  assert.match(script, /--task --task-file/);
  assert.match(script, /--run --json --verbose/);
  assert.match(script, /-h --help zsh bash/);
  assert.match(script, /-h --help -v --version/);
});
