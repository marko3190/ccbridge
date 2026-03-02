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
    totalDurationMs: 492000,
    roleTiming: {
      planner: { durationMs: 173000, calls: 2 },
      critic: { durationMs: 102000, calls: 2 },
      executor: { durationMs: 128000, calls: 1 },
      reviewer: { durationMs: 61000, calls: 1 },
      userInputWaitMs: 28000
    },
    filesChanged: ["src/App.jsx", "src/hooks/useFavorites.js"],
    testsRunCount: 2,
    blockingFindingsCount: 0
  });

  assert.match(text, /Run completed successfully/);
  assert.match(text, /Total duration: 8m 12s/);
  assert.match(text, /Agent breakdown:/);
  assert.match(text, /- Planner \(Claude\): 2 rounds, 2m 53s/);
  assert.match(text, /- User input wait: 28s/);
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
      totalDurationMs: 61000,
      roleTiming: {
        planner: { durationMs: 18000, calls: 1 },
        critic: { durationMs: 12000, calls: 1 },
        executor: { durationMs: 17000, calls: 1 },
        reviewer: { durationMs: 14000, calls: 1 },
        userInputWaitMs: 0
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
  assert.match(text, /Total duration: 1m 1s/);
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

test("renderRunSummary shows a dedicated analysis summary", () => {
  const text = renderRunSummary({
    workflow: "analysis",
    status: "completed",
    runDir: "/tmp/demo/.runs/analysis-123",
    approved: true,
    roundsUsed: 2,
    roleAgents: {
      planner: { role: "Planner", agent: "Claude", provider: "claude-cli", model: "sonnet" },
      critic: { role: "Critic", agent: "Codex", provider: "codex-cli", model: null }
    },
    totalDurationMs: 183000,
    roleTiming: {
      planner: { durationMs: 101000, calls: 2 },
      critic: { durationMs: 52000, calls: 2 },
      executor: { durationMs: 0, calls: 0 },
      reviewer: { durationMs: 0, calls: 0 },
      userInputWaitMs: 30000
    },
    analysisConfidence: "medium",
    analysisSummary: "The repository evidence supports one main hypothesis, but implementation scope still depends on user intent.",
    followUpCount: 1,
    recommendedNextSteps: ["Confirm whether the fix should stay narrow or sweep related views."],
    openQuestions: ["Does the Firefox-only symptom depend on image aspect ratios?"]
  });

  assert.match(text, /Analysis completed successfully/);
  assert.match(text, /Total duration: 3m 3s/);
  assert.match(text, /Analysis approved: yes/);
  assert.match(text, /Analysis rounds: 2/);
  assert.match(text, /Confidence: medium/);
  assert.match(text, /Confidence: medium\n\nSummary:/);
  assert.match(text, /Follow-up questions asked: 1/);
  assert.match(text, /Follow-up questions asked: 1\n\nRecommended next steps:/);
  assert.match(text, /Recommended next steps:/);
  assert.match(text, /- Confirm whether the fix should stay narrow or sweep related views\.\n\nOpen questions:/);
  assert.match(text, /Open questions:/);
  assert.match(text, /Open questions:\n- Does the Firefox-only symptom depend on image aspect ratios\?\n\nArtifacts:/);
});
