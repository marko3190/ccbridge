import path from "node:path";
import {
  ensureDir,
  buildRunId,
  deleteFile,
  readJson,
  writeJson,
  writeText
} from "./files.mjs";
import {
  buildCritiquePrompt,
  buildExecutionPrompt,
  buildPlanPrompt,
  buildReviewPrompt
} from "./prompts.mjs";
import { createProvider } from "./providers/index.mjs";
import { schemasByOperation } from "./schema.mjs";

const STATE_FILE = "state.json";
const SUMMARY_FILE = "summary.json";
const PENDING_INPUT_FILE = "pending-input.json";

function buildProviders(config) {
  return {
    planner: createProvider(config.roles.planner),
    critic: createProvider(config.roles.critic),
    executor: createProvider(config.roles.executor),
    reviewer: createProvider(config.roles.reviewer)
  };
}

function normalizeAgentResponse(response) {
  if (response?.response_type === "needs_input") {
    if (!response.input_request?.questions?.length) {
      throw new Error("Agent returned needs_input without questions.");
    }

    return response;
  }

  if (response?.response_type === "result") {
    return response;
  }

  // Backward compatibility for older providers returning bare payloads.
  return {
    response_type: "result",
    result: response
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
  const response = await provider.run({
    operation,
    prompt,
    payload,
    schema: schemasByOperation[operation],
    workspaceDir,
    runDir,
    roleName
  });

  return normalizeAgentResponse(response);
}

function createInitialState({ config, task, runId, runDir }) {
  return {
    version: 1,
    runId,
    runDir,
    task,
    config,
    status: "running",
    stage: "plan",
    planRound: 1,
    executionAttempt: 1,
    critiqueHistory: [],
    reviewHistory: [],
    inputHistory: [],
    inputSequence: 0,
    pendingInput: null,
    latestReviewToAddress: null,
    plan: null,
    critique: null,
    execution: null,
    review: null
  };
}

function buildSummary(state, extra = {}) {
  return {
    status: state.status,
    runId: state.runId,
    runDir: state.runDir,
    approved: state.plan?.status === "approved",
    roundsUsed: state.planRound,
    reviewRoundsUsed:
      state.status === "waiting_for_user" && state.stage !== "review"
        ? Math.max(0, state.executionAttempt - 1)
        : state.executionAttempt,
    executionStatus: state.execution?.status ?? null,
    reviewVerdict: state.review?.verdict ?? null,
    lastExecutionFile:
      state.executionAttempt && state.execution
        ? path.join(state.runDir, `execution.round-${state.executionAttempt}.json`)
        : null,
    lastReviewFile:
      state.executionAttempt && state.review
        ? path.join(state.runDir, `review.round-${state.executionAttempt}.json`)
        : null,
    pendingInputFile: state.pendingInput
      ? path.join(state.runDir, PENDING_INPUT_FILE)
      : null,
    ...extra
  };
}

async function persistState(state) {
  await writeJson(path.join(state.runDir, STATE_FILE), state);
}

async function persistSummary(state, extra = {}) {
  const summary = buildSummary(state, extra);
  await writeJson(path.join(state.runDir, SUMMARY_FILE), summary);
  return summary;
}

async function clearPendingInputArtifacts(runDir) {
  await deleteFile(path.join(runDir, PENDING_INPUT_FILE));
}

function createInputWaitSummary(state) {
  return persistSummary(state, {
    status: "waiting_for_user",
    waitingStage: state.stage,
    waitingRole: state.pendingInput.role_name,
    questions: state.pendingInput.questions
  });
}

async function pauseForInput(state, roleName, operation, inputRequest) {
  state.inputSequence += 1;
  state.status = "waiting_for_user";
  state.pendingInput = {
    request_id: `input-${state.inputSequence}`,
    role_name: roleName,
    operation,
    stage: state.stage,
    summary: inputRequest.summary,
    questions: inputRequest.questions
  };

  await persistState(state);
  await writeJson(path.join(state.runDir, PENDING_INPUT_FILE), state.pendingInput);
  await writeJson(
    path.join(state.runDir, `${state.pendingInput.request_id}.request.json`),
    state.pendingInput
  );

  return createInputWaitSummary(state);
}

function buildPlanContext(state) {
  return {
    task: state.task,
    workspaceDir: state.config.workspaceDir,
    previousPlan: state.plan,
    critique: state.critique,
    critiqueHistory: state.critiqueHistory,
    inputHistory: state.inputHistory,
    round: state.planRound,
    maxPlanRounds: state.config.maxPlanRounds
  };
}

function buildCritiqueContext(state) {
  return {
    task: state.task,
    workspaceDir: state.config.workspaceDir,
    plan: state.plan,
    round: state.planRound,
    maxPlanRounds: state.config.maxPlanRounds,
    critiqueHistory: state.critiqueHistory,
    inputHistory: state.inputHistory
  };
}

function buildExecutionContext(state) {
  return {
    task: state.task,
    workspaceDir: state.config.workspaceDir,
    plan: state.plan,
    executionAttempt: state.executionAttempt,
    maxReviewRounds: state.config.maxReviewRounds,
    latestReview: state.latestReviewToAddress,
    reviewHistory: state.reviewHistory,
    latestExecution: state.execution,
    inputHistory: state.inputHistory
  };
}

function buildReviewContext(state) {
  return {
    task: state.task,
    workspaceDir: state.config.workspaceDir,
    plan: state.plan,
    execution: state.execution,
    reviewRound: state.executionAttempt,
    maxReviewRounds: state.config.maxReviewRounds,
    reviewHistory: state.reviewHistory,
    inputHistory: state.inputHistory
  };
}

async function runPlanStage(state, providers) {
  const context = buildPlanContext(state);
  const response = await invokeAgent({
    provider: providers.planner,
    roleName: "planner",
    operation: "plan",
    prompt: buildPlanPrompt(context),
    payload: context,
    workspaceDir: state.config.workspaceDir,
    runDir: state.runDir
  });

  if (response.response_type === "needs_input") {
    return pauseForInput(state, "planner", "plan", response.input_request);
  }

  state.plan = response.result;
  await writeJson(path.join(state.runDir, `plan.round-${state.planRound}.json`), state.plan);
  state.stage = "critique";
  state.status = "running";
  await clearPendingInputArtifacts(state.runDir);
  await persistState(state);
  return null;
}

async function runCritiqueStage(state, providers) {
  const context = buildCritiqueContext(state);
  const response = await invokeAgent({
    provider: providers.critic,
    roleName: "critic",
    operation: "critique",
    prompt: buildCritiquePrompt(context),
    payload: context,
    workspaceDir: state.config.workspaceDir,
    runDir: state.runDir
  });

  if (response.response_type === "needs_input") {
    return pauseForInput(state, "critic", "critique", response.input_request);
  }

  state.critique = response.result;
  await writeJson(
    path.join(state.runDir, `critique.round-${state.planRound}.json`),
    state.critique
  );
  state.critiqueHistory.push({
    round: state.planRound,
    approved: state.critique.approved,
    summary: state.critique.summary,
    blocking_issues: state.critique.blocking_issues,
    non_blocking_issues: state.critique.non_blocking_issues
  });

  if (state.critique.approved) {
    state.plan.status = "approved";
    await writeJson(path.join(state.runDir, "plan.approved.json"), state.plan);
    state.stage = "execute";
  } else if (state.planRound === state.config.maxPlanRounds) {
    state.status = "plan_rejected";
    state.stage = "done";
    await persistState(state);
    return persistSummary(state, {
      approved: false,
      lastPlanFile: path.join(state.runDir, `plan.round-${state.planRound}.json`),
      lastCritiqueFile: path.join(state.runDir, `critique.round-${state.planRound}.json`)
    });
  } else {
    state.planRound += 1;
    state.stage = "plan";
  }

  state.status = "running";
  await clearPendingInputArtifacts(state.runDir);
  await persistState(state);
  return null;
}

async function runExecuteStage(state, providers) {
  const context = buildExecutionContext(state);
  const response = await invokeAgent({
    provider: providers.executor,
    roleName: "executor",
    operation: "execute",
    prompt: buildExecutionPrompt(context),
    payload: context,
    workspaceDir: state.config.workspaceDir,
    runDir: state.runDir
  });

  if (response.response_type === "needs_input") {
    return pauseForInput(state, "executor", "execute", response.input_request);
  }

  state.execution = response.result;
  await writeJson(
    path.join(state.runDir, `execution.round-${state.executionAttempt}.json`),
    state.execution
  );
  await writeJson(path.join(state.runDir, "execution.json"), state.execution);
  state.stage = "review";
  state.status = "running";
  await clearPendingInputArtifacts(state.runDir);
  await persistState(state);
  return null;
}

async function runReviewStage(state, providers) {
  const context = buildReviewContext(state);
  const response = await invokeAgent({
    provider: providers.reviewer,
    roleName: "reviewer",
    operation: "review",
    prompt: buildReviewPrompt(context),
    payload: context,
    workspaceDir: state.config.workspaceDir,
    runDir: state.runDir
  });

  if (response.response_type === "needs_input") {
    return pauseForInput(state, "reviewer", "review", response.input_request);
  }

  state.review = response.result;
  state.reviewHistory.push({
    review_round: state.executionAttempt,
    verdict: state.review.verdict,
    summary: state.review.summary,
    blocking_findings: state.review.blocking_findings,
    non_blocking_findings: state.review.non_blocking_findings
  });
  await writeJson(
    path.join(state.runDir, `review.round-${state.executionAttempt}.json`),
    state.review
  );
  await writeJson(path.join(state.runDir, "review.json"), state.review);

  if (state.review.verdict === "pass") {
    state.status = "completed";
    state.stage = "done";
    await persistState(state);
    return persistSummary(state);
  }

  if (state.executionAttempt > state.config.maxReviewRounds) {
    state.status = "review_changes_requested";
    state.stage = "done";
    await persistState(state);
    return persistSummary(state);
  }

  state.latestReviewToAddress = state.review;
  state.executionAttempt += 1;
  state.stage = "execute";
  state.status = "running";
  await clearPendingInputArtifacts(state.runDir);
  await persistState(state);
  return null;
}

async function continueOrchestration(state) {
  const providers = buildProviders(state.config);

  while (state.stage !== "done") {
    let summary = null;

    switch (state.stage) {
      case "plan":
        summary = await runPlanStage(state, providers);
        break;
      case "critique":
        summary = await runCritiqueStage(state, providers);
        break;
      case "execute":
        summary = await runExecuteStage(state, providers);
        break;
      case "review":
        summary = await runReviewStage(state, providers);
        break;
      default:
        throw new Error(`Unknown orchestration stage: ${state.stage}`);
    }

    if (summary) {
      return summary;
    }

    if (state.status === "waiting_for_user") {
      return createInputWaitSummary(state);
    }
  }

  return persistSummary(state);
}

export async function runOrchestration({ config, task }) {
  const runId = buildRunId();
  const runDir = path.join(config.artifactsDir, runId);
  await ensureDir(runDir);
  await writeText(path.join(runDir, "task.txt"), `${task}\n`);

  const state = createInitialState({ config, task, runId, runDir });
  await persistState(state);
  return continueOrchestration(state);
}

export async function loadRunState(runPath) {
  return readJson(path.join(runPath, STATE_FILE));
}

function validateAnswer(question, value) {
  if (question.input_kind === "text") {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Question "${question.id}" expects a non-empty text answer.`);
    }
    return value;
  }

  if (question.input_kind === "single_select") {
    if (typeof value !== "string") {
      throw new Error(`Question "${question.id}" expects a single option id.`);
    }
    const allowed = new Set((question.options ?? []).map((option) => option.id));
    if (!allowed.has(value)) {
      throw new Error(`Question "${question.id}" received invalid option "${value}".`);
    }
    return value;
  }

  if (question.input_kind === "multi_select") {
    if (!Array.isArray(value) || !value.length) {
      throw new Error(`Question "${question.id}" expects an array of option ids.`);
    }
    const allowed = new Set((question.options ?? []).map((option) => option.id));
    for (const entry of value) {
      if (typeof entry !== "string" || !allowed.has(entry)) {
        throw new Error(`Question "${question.id}" received invalid option "${entry}".`);
      }
    }

    if (
      typeof question.min_select === "number" &&
      value.length < question.min_select
    ) {
      throw new Error(
        `Question "${question.id}" requires at least ${question.min_select} selections.`
      );
    }

    if (
      typeof question.max_select === "number" &&
      value.length > question.max_select
    ) {
      throw new Error(
        `Question "${question.id}" allows at most ${question.max_select} selections.`
      );
    }

    return value;
  }

  throw new Error(`Unsupported input kind: ${question.input_kind}`);
}

function normalizeAnswers(pendingInput, answers) {
  const normalized = {};

  for (const question of pendingInput.questions) {
    const value = answers?.[question.id];

    if (value == null) {
      if (question.required !== false) {
        throw new Error(`Missing required answer for question "${question.id}".`);
      }
      continue;
    }

    normalized[question.id] = validateAnswer(question, value);
  }

  return normalized;
}

export async function answerAndResumeRun({ runPath, answers }) {
  const state = await loadRunState(runPath);

  if (state.status !== "waiting_for_user" || !state.pendingInput) {
    throw new Error("This run is not waiting for user input.");
  }

  const normalizedAnswers = normalizeAnswers(state.pendingInput, answers);
  const answerArtifact = {
    request_id: state.pendingInput.request_id,
    stage: state.pendingInput.stage,
    role_name: state.pendingInput.role_name,
    summary: state.pendingInput.summary,
    answers: normalizedAnswers
  };

  state.inputHistory.push(answerArtifact);
  state.pendingInput = null;
  state.status = "running";

  await writeJson(
    path.join(state.runDir, `${answerArtifact.request_id}.answer.json`),
    answerArtifact
  );
  await clearPendingInputArtifacts(state.runDir);
  await persistState(state);

  return continueOrchestration(state);
}

export async function resumeRun({ runPath }) {
  const state = await loadRunState(runPath);

  if (state.status === "waiting_for_user") {
    throw new Error("This run is still waiting for user input. Use ccbridge answer first.");
  }

  if (state.stage === "done") {
    return persistSummary(state);
  }

  state.status = "running";
  await persistState(state);
  return continueOrchestration(state);
}
