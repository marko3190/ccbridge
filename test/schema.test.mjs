import test from "node:test";
import assert from "node:assert/strict";
import { schemasByOperation } from "../src/schema.mjs";

test("codex output schema uses strict required fields for needs_input envelopes", () => {
  const critiqueSchema = schemasByOperation.critique;

  assert.deepEqual(critiqueSchema.required, [
    "response_type",
    "result",
    "input_request"
  ]);

  const inputQuestionSchema =
    critiqueSchema.properties.input_request.anyOf[0].properties.questions.items;
  assert.deepEqual(inputQuestionSchema.required, [
    "id",
    "prompt",
    "input_kind",
    "answer_source",
    "reason",
    "placeholder",
    "required",
    "min_select",
    "max_select",
    "options"
  ]);

  const inputOptionSchema = inputQuestionSchema.properties.options.anyOf[0].items;
  assert.deepEqual(inputOptionSchema.required, ["id", "label", "description"]);
});
