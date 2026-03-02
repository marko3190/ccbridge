import test from "node:test";
import assert from "node:assert/strict";
import { renderRunSummary } from "../src/summary-output.mjs";

test("renderRunSummary shows a human-readable success summary with changed files", () => {
  const text = renderRunSummary({
    status: "completed",
    runDir: "/tmp/demo/.runs/run-123",
    approved: true,
    roundsUsed: 2,
    reviewRoundsUsed: 1,
    executionStatus: "completed",
    reviewVerdict: "pass",
    roleAgents: {
      planner: { role: "Planner", agent: "Claude", provider: "claude-cli", model: "sonnet" },
      critic: { role: "Critic", agent: "Codex", provider: "codex-cli", model: null },
      executor: { role: "Executor", agent: "Claude", provider: "claude-cli", model: "sonnet" },
      reviewer: { role: "Reviewer", agent: "Codex", provider: "codex-cli", model: null }
    },
    filesChanged: ["src/App.jsx", "src/hooks/useFavorites.js"],
    testsRunCount: 2,
    blockingFindingsCount: 0
  });

  assert.match(text, /Run completed successfully/);
  assert.match(text, /Changes implemented: yes/);
  assert.match(text, /Review verdict: pass/);
  assert.match(text, /Files changed:/);
  assert.match(text, /- src\/App\.jsx/);
  assert.match(text, /Validation commands run: 2/);
});

test("renderRunSummary includes role-agent mapping in verbose mode", () => {
  const text = renderRunSummary(
    {
      status: "completed",
      runDir: "/tmp/demo/.runs/run-123",
      approved: true,
      roundsUsed: 1,
      reviewRoundsUsed: 1,
      executionStatus: "completed",
      reviewVerdict: "pass",
      roleAgents: {
        planner: { role: "Planner", agent: "Claude", provider: "claude-cli", model: "sonnet" },
        critic: { role: "Critic", agent: "Codex", provider: "codex-cli", model: null },
        executor: { role: "Executor", agent: "Claude", provider: "claude-cli", model: "sonnet" },
        reviewer: { role: "Reviewer", agent: "Codex", provider: "codex-cli", model: null }
      },
      filesChanged: ["src/App.jsx"],
      testsRunCount: 2,
      lastExecutionFile: "/tmp/demo/.runs/run-123/execution.round-1.json",
      lastReviewFile: "/tmp/demo/.runs/run-123/review.round-1.json"
    },
    { verbose: true }
  );

  assert.match(text, /Agents:/);
  assert.match(text, /- Planner: Claude \[claude-cli\] model=sonnet/);
  assert.match(text, /- Critic: Codex \[codex-cli\]/);
  assert.match(text, /Last execution artifact: \/tmp\/demo\/.runs\/run-123\/execution\.round-1\.json/);
});

test("renderRunSummary explains a stopped review run", () => {
  const text = renderRunSummary({
    status: "review_changes_requested",
    runDir: "/tmp/demo/.runs/run-456",
    approved: true,
    roundsUsed: 1,
    reviewRoundsUsed: 2,
    executionStatus: "completed",
    reviewVerdict: "changes_requested",
    filesChanged: ["src/components/CompareView.jsx"],
    testsRunCount: 2,
    blockingFindingsCount: 1
  });

  assert.match(text, /Run stopped: review still requests changes/);
  assert.match(text, /Blocking findings: 1/);
  assert.match(text, /- src\/components\/CompareView\.jsx/);
});
