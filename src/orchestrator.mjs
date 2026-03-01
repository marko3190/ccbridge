import path from "node:path";
import { ensureDir, buildRunId, writeJson, writeText } from "./files.mjs";
import {
  buildCritiquePrompt,
  buildExecutionPrompt,
  buildPlanPrompt,
  buildReviewPrompt
} from "./prompts.mjs";
import { createProvider } from "./providers/index.mjs";
import { schemasByOperation } from "./schema.mjs";

function buildProviders(config) {
  return {
    planner: createProvider(config.roles.planner),
    critic: createProvider(config.roles.critic),
    executor: createProvider(config.roles.executor),
    reviewer: createProvider(config.roles.reviewer)
  };
}

async function invokeAgent({
  provider,
  roleName,
  operation,
  prompt,
  payload,
  workspaceDir,
  runDir
}) {
  return provider.run({
    operation,
    prompt,
    payload,
    schema: schemasByOperation[operation],
    workspaceDir,
    runDir,
    roleName
  });
}

export async function runOrchestration({ config, task }) {
  const runId = buildRunId();
  const runDir = path.join(config.artifactsDir, runId);
  await ensureDir(runDir);
  await writeText(path.join(runDir, "task.txt"), `${task}\n`);

  const providers = buildProviders(config);
  const critiqueHistory = [];
  const reviewHistory = [];

  let round = 1;
  let plan = await invokeAgent({
    provider: providers.planner,
    roleName: "planner",
    operation: "plan",
    prompt: buildPlanPrompt({
      task,
      workspaceDir: config.workspaceDir,
      round,
      maxPlanRounds: config.maxPlanRounds,
      critiqueHistory
    }),
    payload: {
      task,
      workspaceDir: config.workspaceDir,
      round,
      maxPlanRounds: config.maxPlanRounds,
      critiqueHistory
    },
    workspaceDir: config.workspaceDir,
    runDir
  });
  await writeJson(path.join(runDir, `plan.round-${round}.json`), plan);

  let critique;

  while (round <= config.maxPlanRounds) {
    critique = await invokeAgent({
      provider: providers.critic,
      roleName: "critic",
      operation: "critique",
      prompt: buildCritiquePrompt({
        task,
        workspaceDir: config.workspaceDir,
        plan,
        round,
        maxPlanRounds: config.maxPlanRounds,
        critiqueHistory
      }),
      payload: {
        task,
        workspaceDir: config.workspaceDir,
        plan,
        round,
        maxPlanRounds: config.maxPlanRounds,
        critiqueHistory
      },
      workspaceDir: config.workspaceDir,
      runDir
    });
    await writeJson(path.join(runDir, `critique.round-${round}.json`), critique);
    critiqueHistory.push({
      round,
      approved: critique.approved,
      summary: critique.summary,
      blocking_issues: critique.blocking_issues,
      non_blocking_issues: critique.non_blocking_issues
    });

    if (critique.approved) {
      plan.status = "approved";
      await writeJson(path.join(runDir, "plan.approved.json"), plan);
      break;
    }

    if (round === config.maxPlanRounds) {
      const summary = {
        status: "plan_rejected",
        runId,
        runDir,
        approved: false,
        roundsUsed: round,
        lastPlanFile: path.join(runDir, `plan.round-${round}.json`),
        lastCritiqueFile: path.join(runDir, `critique.round-${round}.json`)
      };
      await writeJson(path.join(runDir, "summary.json"), summary);
      return summary;
    }

    round += 1;
    plan = await invokeAgent({
      provider: providers.planner,
      roleName: "planner",
      operation: "plan",
      prompt: buildPlanPrompt({
        task,
        workspaceDir: config.workspaceDir,
        previousPlan: plan,
        critique,
        critiqueHistory,
        round,
        maxPlanRounds: config.maxPlanRounds
      }),
      payload: {
        task,
        workspaceDir: config.workspaceDir,
        previousPlan: plan,
        critique,
        critiqueHistory,
        round,
        maxPlanRounds: config.maxPlanRounds
      },
      workspaceDir: config.workspaceDir,
      runDir
    });
    await writeJson(path.join(runDir, `plan.round-${round}.json`), plan);
  }

  let executionAttempt = 1;
  let execution;
  let review;
  let latestReviewToAddress;

  while (executionAttempt <= config.maxReviewRounds + 1) {
    execution = await invokeAgent({
      provider: providers.executor,
      roleName: "executor",
      operation: "execute",
      prompt: buildExecutionPrompt({
        task,
        workspaceDir: config.workspaceDir,
        plan,
        executionAttempt,
        maxReviewRounds: config.maxReviewRounds,
        latestReview: latestReviewToAddress,
        reviewHistory,
        latestExecution: execution
      }),
      payload: {
        task,
        workspaceDir: config.workspaceDir,
        plan,
        executionAttempt,
        maxReviewRounds: config.maxReviewRounds,
        latestReview: latestReviewToAddress,
        reviewHistory,
        latestExecution: execution
      },
      workspaceDir: config.workspaceDir,
      runDir
    });
    await writeJson(path.join(runDir, `execution.round-${executionAttempt}.json`), execution);
    await writeJson(path.join(runDir, "execution.json"), execution);

    review = await invokeAgent({
      provider: providers.reviewer,
      roleName: "reviewer",
      operation: "review",
      prompt: buildReviewPrompt({
        task,
        workspaceDir: config.workspaceDir,
        plan,
        execution,
        reviewRound: executionAttempt,
        maxReviewRounds: config.maxReviewRounds,
        reviewHistory
      }),
      payload: {
        task,
        workspaceDir: config.workspaceDir,
        plan,
        execution,
        reviewRound: executionAttempt,
        maxReviewRounds: config.maxReviewRounds,
        reviewHistory
      },
      workspaceDir: config.workspaceDir,
      runDir
    });
    reviewHistory.push({
      review_round: executionAttempt,
      verdict: review.verdict,
      summary: review.summary,
      blocking_findings: review.blocking_findings,
      non_blocking_findings: review.non_blocking_findings
    });
    await writeJson(path.join(runDir, `review.round-${executionAttempt}.json`), review);
    await writeJson(path.join(runDir, "review.json"), review);

    if (review.verdict === "pass") {
      break;
    }

    if (executionAttempt > config.maxReviewRounds) {
      break;
    }

    latestReviewToAddress = review;
    executionAttempt += 1;
  }

  const summary = {
    status: review.verdict === "pass" ? "completed" : "review_changes_requested",
    runId,
    runDir,
    approved: true,
    roundsUsed: round,
    reviewRoundsUsed: executionAttempt,
    executionStatus: execution.status,
    reviewVerdict: review.verdict,
    lastExecutionFile: path.join(runDir, `execution.round-${executionAttempt}.json`),
    lastReviewFile: path.join(runDir, `review.round-${executionAttempt}.json`)
  };
  await writeJson(path.join(runDir, "summary.json"), summary);

  return summary;
}
