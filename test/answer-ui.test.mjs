import test from "node:test";
import assert from "node:assert/strict";
import {
  collectAnswers,
  normalizeInteractiveAnswer,
  renderWaitingForUserHint
} from "../src/answer-ui.mjs";

test("normalizeInteractiveAnswer supports numbered single-select answers", () => {
  const answer = normalizeInteractiveAnswer(
    {
      id: "location_method",
      input_kind: "single_select",
      required: true,
      options: [
        { id: "search", label: "Search" },
        { id: "geo", label: "Geolocation" }
      ]
    },
    "2"
  );

  assert.equal(answer, "geo");
});

test("normalizeInteractiveAnswer supports comma-separated multi-select answers", () => {
  const answer = normalizeInteractiveAnswer(
    {
      id: "allowed_scopes",
      input_kind: "multi_select",
      required: true,
      min_select: 1,
      max_select: 3,
      options: [
        { id: "docs", label: "Docs" },
        { id: "tests", label: "Tests" },
        { id: "ui", label: "UI" }
      ]
    },
    "1, 3"
  );

  assert.deepEqual(answer, ["docs", "ui"]);
});

test("collectAnswers retries invalid interactive input and returns normalized answers", async () => {
  const prompts = [];
  const writes = [];
  const answers = await collectAnswers({
    pendingInput: {
      summary: "Need a few decisions.",
      questions: [
        {
          id: "data_source",
          prompt: "Where should the weather data come from?",
          input_kind: "single_select",
          required: true,
          options: [
            { id: "mock", label: "Mock" },
            { id: "real_api", label: "Real API" }
          ]
        },
        {
          id: "notes",
          prompt: "Any extra notes?",
          input_kind: "text",
          required: false,
          placeholder: "Optional note"
        }
      ]
    },
    ask: async (prompt) => {
      prompts.push(prompt);
      if (prompts.length === 1) {
        return "9";
      }

      if (prompts.length === 2) {
        return "1";
      }

      return "";
    },
    write: (text) => writes.push(text)
  });

  assert.deepEqual(answers, {
    data_source: "mock"
  });
  assert.match(writes.join(""), /Invalid answer/);
  assert.equal(prompts[0], "Choose one option by number or id: ");
  assert.equal(prompts[2], "Enter your answer, or press Enter to skip: ");
});

test("renderWaitingForUserHint shows the interactive next step", () => {
  const message = renderWaitingForUserHint({
    status: "waiting_for_user",
    runId: "2026-03-01T20-25-50.035Z",
    runDir: "/tmp/demo/.runs/2026-03-01T20-25-50.035Z",
    waitingRole: "planner",
    waitingStage: "plan",
    questions: [{ id: "q1" }, { id: "q2" }]
  });

  assert.match(message, /Run paused: planner needs input during plan/);
  assert.match(message, /Answer them interactively with/);
  assert.match(message, /ccbridge answer --run 2026-03-01T20-25-50.035Z/);
});
