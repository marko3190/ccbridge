import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { parseStructuredOutput, runCommand } from "../src/providers/cli-shared.mjs";

test("parseStructuredOutput preserves wrapped result envelopes", () => {
  const parsed = parseStructuredOutput(
    JSON.stringify({
      response_type: "result",
      result: {
        status: "completed",
        summary: "Done.",
        files_changed: ["README.md"],
        tests_run: [],
        plan_deviations: [],
        follow_up: []
      }
    })
  );

  assert.equal(parsed.response_type, "result");
  assert.equal(parsed.result.status, "completed");
});

test("parseStructuredOutput preserves wrapped needs_input envelopes", () => {
  const parsed = parseStructuredOutput(
    JSON.stringify({
      response_type: "needs_input",
      input_request: {
        summary: "Need scope confirmation.",
        questions: [
          {
            id: "allowed_scopes",
            prompt: "Choose allowed scopes.",
            input_kind: "multi_select",
            answer_source: "human",
            options: [
              { id: "docs", label: "Docs" },
              { id: "tests", label: "Tests" }
            ]
          }
        ]
      }
    })
  );

  assert.equal(parsed.response_type, "needs_input");
  assert.equal(parsed.input_request.questions[0].id, "allowed_scopes");
});

test("runCommand times out long-running agent calls", async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-run-command-"));

  await assert.rejects(
    () =>
      runCommand({
        command: process.execPath,
        args: ["-e", "setTimeout(() => {}, 1000)"],
        cwd: runDir,
        rawLogPrefix: "timeout-test",
        runDir,
        timeoutMs: 50
      }),
    /Timed out after 50ms/
  );
});
