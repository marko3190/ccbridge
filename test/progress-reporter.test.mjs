import test from "node:test";
import assert from "node:assert/strict";
import { createProgressReporter } from "../src/progress-reporter.mjs";

function createOutput(isTTY = false) {
  let text = "";
  return {
    isTTY,
    write(chunk) {
      text += chunk;
    },
    read() {
      return text;
    }
  };
}

test("progress reporter prints concise stage updates in non-interactive mode", () => {
  const output = createOutput(false);
  const report = createProgressReporter(output, {
    roleAgents: {
      planner: { role: "Planner", agent: "Claude" },
      critic: { role: "Critic", agent: "Codex" },
      executor: { role: "Executor", agent: "Claude" },
      reviewer: { role: "Reviewer", agent: "Codex" }
    }
  });

  report({ type: "run_started", runId: "run-123" });
  report({ type: "stage_start", stage: "plan", planRound: 1 });
  report({ type: "agent_call_start", roleName: "planner", operation: "plan" });
  report({
    type: "agent_call_heartbeat",
    roleName: "planner",
    operation: "plan",
    elapsedMs: 10000
  });
  report({
    type: "agent_call_done",
    roleName: "planner",
    operation: "plan",
    elapsedMs: 12000
  });
  report({
    type: "stage_result",
    stage: "plan",
    stepCount: 3,
    fileCount: 2,
    testCount: 1
  });

  const text = output.read();
  assert.match(text, /Starting run run-123/);
  assert.match(text, /Planner \(Claude\) round 1 started/);
  assert.match(text, /still working: Planner \(Claude\) is drafting the implementation plan \(10s elapsed\)/);
  assert.match(text, /done: Planner \(Claude\) is drafting the implementation plan in 12s/);
  assert.match(text, /plan ready: 3 steps, 2 files, 1 test/);
});

test("progress reporter prints full review summaries across wrapped lines", () => {
  const output = createOutput(false);
  const report = createProgressReporter(output, {
    roleAgents: {
      reviewer: { role: "Reviewer", agent: "Codex" }
    }
  });

  report({ type: "stage_start", stage: "review", reviewRound: 2 });
  report({
    type: "stage_result",
    stage: "review",
    verdict: "changes_requested",
    blockingCount: 2,
    nonBlockingCount: 1,
    summary: "Two blocking issues remain in duplicate-city handling and one minor follow-up note is left for later."
  });

  const text = output.read();
  assert.match(text, /Reviewer \(Codex\) pass 2 started/);
  assert.match(text, /review requested changes: 2 blocking findings, 1 non-blocking note/);
  assert.match(text, /summary: Two blocking issues remain in duplicate-city handling/);
  assert.match(text, /one minor follow-up note is\s+left for later\./);
});
