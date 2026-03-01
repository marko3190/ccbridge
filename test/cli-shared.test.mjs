import test from "node:test";
import assert from "node:assert/strict";
import { parseStructuredOutput } from "../src/providers/cli-shared.mjs";

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
