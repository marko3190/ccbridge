import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.mjs";
import { runOrchestration } from "../src/orchestrator.mjs";
import { buildCritiquePrompt, buildPlanPrompt, buildReviewPrompt } from "../src/prompts.mjs";

function createMockConfig(baseDir) {
  return {
    workspaceDir: baseDir,
    artifactsDir: path.join(baseDir, ".runs"),
    maxPlanRounds: 3,
    maxReviewRounds: 1,
    roles: {
      planner: { provider: "mock" },
      critic: { provider: "mock" },
      executor: { provider: "mock" },
      reviewer: { provider: "mock", behavior: "always_approve" }
    }
  };
}

test("runOrchestration completes in mock mode and writes summary", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-"));
  const summary = await runOrchestration({
    config: createMockConfig(baseDir),
    task: "Add a safe planner-reviewer handshake."
  });

  assert.equal(summary.status, "completed");
  assert.equal(summary.approved, true);
  assert.equal(summary.reviewVerdict, "pass");

  const summaryPath = path.join(summary.runDir, "summary.json");
  const summaryOnDisk = JSON.parse(await readFile(summaryPath, "utf8"));
  assert.equal(summaryOnDisk.status, "completed");
});

test("runOrchestration performs a repair round after review changes requested", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-review-"));
  const config = createMockConfig(baseDir);
  config.roles.reviewer = { provider: "mock", behavior: "request_changes_once" };

  const summary = await runOrchestration({
    config,
    task: "Exercise the review repair loop."
  });

  assert.equal(summary.status, "completed");
  assert.equal(summary.reviewVerdict, "pass");
  assert.equal(summary.reviewRoundsUsed, 2);

  const reviewRound1 = JSON.parse(
    await readFile(path.join(summary.runDir, "review.round-1.json"), "utf8")
  );
  const reviewRound2 = JSON.parse(
    await readFile(path.join(summary.runDir, "review.round-2.json"), "utf8")
  );

  assert.equal(reviewRound1.verdict, "changes_requested");
  assert.equal(reviewRound2.verdict, "pass");
});

test("plan prompt asks for explicit revision notes and includes critique history", () => {
  const prompt = buildPlanPrompt({
    task: "Tighten plan convergence.",
    workspaceDir: "/tmp/repo",
    previousPlan: {
      goal: "Old goal",
      revision_notes: [],
      assumptions: [],
      steps: [],
      files_to_touch: [],
      risks: [],
      tests: [],
      acceptance_criteria: [],
      open_questions: [],
      status: "draft"
    },
    critique: {
      approved: false,
      summary: "Need a tighter validation step.",
      blocking_issues: [
        {
          id: "validation-gap",
          title: "Validation gap",
          details: "Core verification is too weak.",
          suggested_fix: "Add a focused validation step."
        }
      ],
      non_blocking_issues: []
    },
    critiqueHistory: [
      {
        round: 1,
        approved: false,
        summary: "Need a tighter validation step.",
        blocking_issues: [
          {
            id: "validation-gap",
            title: "Validation gap",
            details: "Core verification is too weak.",
            suggested_fix: "Add a focused validation step."
          }
        ],
        non_blocking_issues: []
      }
    ],
    round: 2,
    maxPlanRounds: 3
  });

  assert.match(prompt, /Always populate revision_notes/);
  assert.match(prompt, /Critique history/);
  assert.match(prompt, /validation-gap/);
});

test("critique prompt emphasizes high blocking threshold and final-round convergence", () => {
  const prompt = buildCritiquePrompt({
    task: "Tighten plan convergence.",
    workspaceDir: "/tmp/repo",
    plan: {
      goal: "Goal",
      revision_notes: [
        {
          issue_id: "validation-gap",
          status: "addressed",
          resolution: "Added a focused validation step."
        }
      ],
      assumptions: [],
      steps: [],
      files_to_touch: [],
      risks: [],
      tests: [],
      acceptance_criteria: [],
      open_questions: [],
      status: "needs_revision"
    },
    round: 3,
    maxPlanRounds: 3,
    critiqueHistory: [
      {
        round: 1,
        approved: false,
        summary: "Need a tighter validation step.",
        blocking_issues: [
          {
            id: "validation-gap",
            title: "Validation gap",
            details: "Core verification is too weak.",
            suggested_fix: "Add a focused validation step."
          }
        ],
        non_blocking_issues: []
      }
    ]
  });

  assert.match(prompt, /Use a high bar for blocking issues/);
  assert.match(prompt, /This is the final planning round/);
  assert.match(prompt, /Approve when the plan is good enough to execute safely/);
});

test("loadConfig can build a runnable config from a preset without a config file", async () => {
  const config = await loadConfig(null, {
    preset: "codex-exec",
    workspaceDir: "/tmp/demo-workspace"
  });

  assert.equal(config.roles.planner.provider, "claude-cli");
  assert.equal(config.roles.executor.provider, "codex-cli");
  assert.equal(config.roles.executor.sandbox, "workspace-write");
  assert.equal(config.workspaceDir, "/tmp/demo-workspace");
});

test("review prompt marks the final allowed review pass correctly", () => {
  const prompt = buildReviewPrompt({
    task: "Finalize the change set.",
    workspaceDir: "/tmp/repo",
    plan: {
      goal: "Goal",
      revision_notes: [],
      assumptions: [],
      steps: [],
      files_to_touch: [],
      risks: [],
      tests: [],
      acceptance_criteria: [],
      open_questions: [],
      status: "approved"
    },
    execution: {
      status: "completed",
      summary: "Done.",
      files_changed: ["README.md"],
      tests_run: [],
      plan_deviations: [],
      follow_up: []
    },
    reviewRound: 2,
    maxReviewRounds: 1,
    reviewHistory: []
  });

  assert.match(prompt, /This is the final allowed review pass/);
});
