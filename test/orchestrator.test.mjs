import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.mjs";
import {
  answerAndResumeRun,
  askAnalysisRun,
  continueReviewRun,
  loadRunState,
  runAnalysis,
  runOrchestration
} from "../src/orchestrator.mjs";
import {
  buildAnalysisPrompt,
  buildChallengePrompt,
  buildCritiquePrompt,
  buildExecutionPrompt,
  buildPlanPrompt,
  buildReviewPrompt
} from "../src/prompts.mjs";

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
  assert.equal(typeof summaryOnDisk.totalDurationMs, "number");
  assert.ok(summaryOnDisk.roleTiming.planner.calls >= 1);
  assert.ok(summaryOnDisk.roleTiming.critic.calls >= 1);
  assert.ok(summaryOnDisk.roleTiming.executor.calls >= 1);
  assert.ok(summaryOnDisk.roleTiming.reviewer.calls >= 1);
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
  assert.ok(Array.isArray(summary.filesChanged));
});

test("continueReviewRun grants one extra repair round after review limit exhaustion", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-continue-"));
  const config = createMockConfig(baseDir);
  config.roles.reviewer = { provider: "mock", behavior: "request_changes_twice" };

  const stoppedSummary = await runOrchestration({
    config,
    task: "Exercise continue after exhausted review repair rounds."
  });

  assert.equal(stoppedSummary.status, "review_changes_requested");
  assert.equal(stoppedSummary.reviewVerdict, "changes_requested");
  assert.equal(stoppedSummary.reviewRoundsUsed, 2);
  assert.equal(stoppedSummary.maxReviewRounds, 1);

  const finalSummary = await continueReviewRun({
    runPath: stoppedSummary.runDir
  });

  assert.equal(finalSummary.status, "completed");
  assert.equal(finalSummary.reviewVerdict, "pass");
  assert.equal(finalSummary.reviewRoundsUsed, 3);
  assert.equal(finalSummary.maxReviewRounds, 2);

  const reviewRound3 = JSON.parse(
    await readFile(path.join(stoppedSummary.runDir, "review.round-3.json"), "utf8")
  );
  assert.equal(reviewRound3.verdict, "pass");
});

test("runOrchestration can pause for user input and resume after multi-select answers", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-input-"));
  const config = createMockConfig(baseDir);
  config.roles.executor = { provider: "mock", behavior: "needs_input_once" };

  const waitingSummary = await runOrchestration({
    config,
    task: "Exercise the user input pause and resume flow."
  });

  assert.equal(waitingSummary.status, "waiting_for_user");
  assert.equal(waitingSummary.waitingStage, "execute");
  assert.equal(waitingSummary.questions[0].input_kind, "multi_select");

  const stateBeforeAnswer = await loadRunState(waitingSummary.runDir);
  assert.equal(stateBeforeAnswer.pendingInput.questions[0].id, "allowed_scopes");

  const finalSummary = await answerAndResumeRun({
    runPath: waitingSummary.runDir,
    answers: {
      allowed_scopes: ["docs"]
    }
  });

  assert.equal(finalSummary.status, "completed");
  assert.equal(finalSummary.reviewVerdict, "pass");

  const answerArtifact = JSON.parse(
    await readFile(path.join(waitingSummary.runDir, "input-1.answer.json"), "utf8")
  );
  assert.deepEqual(answerArtifact.answers.allowed_scopes, ["docs"]);
});

test("runAnalysis completes in mock mode and writes an analysis summary", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-analysis-"));
  const summary = await runAnalysis({
    config: createMockConfig(baseDir),
    task: "Analyze whether one reported UI bug should trigger a broader sweep."
  });

  assert.equal(summary.workflow, "analysis");
  assert.equal(summary.status, "completed");
  assert.equal(summary.approved, true);
  assert.ok(["low", "medium", "high"].includes(summary.analysisConfidence));
  assert.equal(summary.executionStatus, null);
});

test("askAnalysisRun continues a completed analysis with a follow-up question", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "ccbridge-analysis-ask-"));
  const initialSummary = await runAnalysis({
    config: createMockConfig(baseDir),
    task: "Analyze the first reported issue."
  });

  const followUpSummary = await askAnalysisRun({
    runPath: initialSummary.runDir,
    question: "Does the same reasoning apply to the compare view as well?"
  });

  assert.equal(followUpSummary.workflow, "analysis");
  assert.equal(followUpSummary.status, "completed");
  assert.ok(followUpSummary.roundsUsed > initialSummary.roundsUsed);
  assert.equal(followUpSummary.followUpCount, 1);
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
  assert.match(prompt, /Do not silently expand the task from one reported instance to every similar instance you discover/);
  assert.match(prompt, /ask the user whether to keep the fix narrow or widen it/);
});

test("analysis prompt asks for convergence without code changes", () => {
  const prompt = buildAnalysisPrompt({
    task: "Analyze the reported Firefox rendering issue.",
    workspaceDir: "/tmp/repo",
    previousAnalysis: null,
    challenge: null,
    challengeHistory: [],
    inputHistory: [],
    followUpQuestions: [],
    round: 1,
    maxAnalysisRounds: 3
  });

  assert.match(prompt, /Produce analysis only/);
  assert.match(prompt, /Do not write code, do not apply edits/);
  assert.match(prompt, /share the same delivery goal as the challenger/);
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
  assert.match(prompt, /treat that as scope drift unless the widening is obviously part of the same minimal fix/);
  assert.match(prompt, /prefer needs_input over silently approving the wider scope/);
});

test("challenge prompt prefers collaboration over adversarial blocking", () => {
  const prompt = buildChallengePrompt({
    task: "Analyze a reported UI rendering issue.",
    workspaceDir: "/tmp/repo",
    analysis: {
      summary: "Likely one CSS sizing bug.",
      revision_notes: [],
      confirmed_findings: [],
      likely_causes: [],
      evidence: [],
      affected_areas: [],
      open_questions: [],
      recommended_next_steps: [],
      confidence: "medium",
      status: "draft"
    },
    round: 1,
    maxAnalysisRounds: 3,
    challengeHistory: [],
    inputHistory: [],
    followUpQuestions: []
  });

  assert.match(prompt, /share the same delivery goal as the analyst/);
  assert.match(prompt, /Do not write a replacement analysis from scratch/);
  assert.match(prompt, /prefer needs_input over forcing the analyst to guess/);
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
  assert.equal(config.maxAgentCallMs, 900000);
});

test("balanced preset gives Claude executor non-interactive validation permissions", async () => {
  const config = await loadConfig(null, {
    preset: "balanced",
    workspaceDir: "/tmp/demo-workspace"
  });

  assert.equal(config.roles.executor.provider, "claude-cli");
  assert.equal(config.roles.executor.permissionMode, "bypassPermissions");
  assert.equal(config.roles.executor.dangerouslySkipPermissions, true);
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

test("review prompt adds a soft targeted checklist for persistence and resolved user decisions", () => {
  const prompt = buildReviewPrompt({
    task: "Add favorite cities with localStorage persistence and a max limit.",
    workspaceDir: "/tmp/repo",
    plan: {
      goal: "Goal",
      revision_notes: [],
      assumptions: [],
      steps: ["Persist favorites in localStorage", "Show favorite chips below the search bar"],
      files_to_touch: ["src/App.jsx", "src/hooks/useFavorites.js"],
      risks: ["localStorage can contain invalid data"],
      tests: ["Add hook tests for duplicate and max-limit behavior"],
      acceptance_criteria: [],
      open_questions: [],
      status: "approved"
    },
    execution: {
      status: "completed",
      summary: "Added favorites with localStorage and chip selection.",
      files_changed: ["src/App.jsx", "src/hooks/useFavorites.js"],
      tests_run: [],
      plan_deviations: [],
      follow_up: []
    },
    reviewRound: 1,
    maxReviewRounds: 1,
    reviewHistory: [],
    inputHistory: [
      {
        stage: "plan",
        role_name: "planner",
        summary: "User selected favorite cities, localStorage persistence, and a max of 5.",
        answers: {
          saved_list_kind: "favorites",
          persistence: "localstorage",
          max_favorites: "5"
        }
      }
    ]
  });

  assert.match(prompt, /Targeted review checklist/);
  assert.match(prompt, /coverage guidance, not as automatic blockers/);
  assert.match(prompt, /matches the resolved user decisions exactly/);
  assert.match(prompt, /hydration from persisted storage/);
  assert.match(prompt, /silent failures when the UI ignores a user action without feedback/);
});

test("execution prompt asks for user input before widening scope to similar bugs", () => {
  const prompt = buildExecutionPrompt({
    task: "Fix the reported leading-space search bug in one admin view.",
    workspaceDir: "/tmp/repo",
    plan: {
      goal: "Fix one reported admin search bug.",
      revision_notes: [],
      assumptions: [],
      steps: ["Trim the reported search input on frontend and backend."],
      files_to_touch: ["pages/admin/example.vue", "server/api/admin/example/index.get.js"],
      risks: [],
      tests: ["Run npm run build"],
      acceptance_criteria: [],
      open_questions: [],
      status: "approved"
    },
    executionAttempt: 1,
    maxReviewRounds: 1,
    reviewHistory: []
  });

  assert.match(prompt, /If you discover the same bug or pattern in additional places beyond the approved plan, do not silently widen the implementation/);
  assert.match(prompt, /use needs_input so the user can decide between fixing only the approved scope and broadening the task/);
});
