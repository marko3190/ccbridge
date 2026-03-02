#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { access, readFile } from "node:fs/promises";
import {
  promptForAnswersInteractively,
  renderContinueHint,
  renderWaitingForUserHint
} from "./answer-ui.mjs";
import { loadConfig } from "./config.mjs";
import {
  answerAndResumeRun,
  continueReviewRun,
  loadRunState,
  resumeRun,
  runOrchestration
} from "./orchestrator.mjs";
import { formatPreflightReport, runPreflight } from "./preflight.mjs";
import { getPresetNames, getPresetSummaries } from "./presets.mjs";

function printHelp() {
  const lines = [
    "Usage:",
    "  ccbridge run --task \"<task>\"",
    "  ccbridge run --task-file <path>",
    "  ccbridge doctor",
    "  ccbridge presets",
    "  ccbridge answer --run <runId|runDir>",
    "  ccbridge resume --run <runId|runDir>",
    "  ccbridge continue --run <runId|runDir>",
    "",
    "Options:",
    "  --config <path>        Path to ccbridge config JSON. Optional if a preset is enough.",
    "  --preset <name>        Preset role layout. Defaults to balanced.",
    "  --task <text>          Task to give the planner.",
    "  --task-file <path>     Read task from a file.",
    "  --workspace <path>     Override workspaceDir from config.",
    "  --artifacts <path>     Override artifactsDir from config.",
    "  --max-rounds <n>       Override maxPlanRounds from config.",
    "  --max-review-rounds <n> Override maxReviewRounds from config.",
    "  --skip-preflight       Skip auth and binary checks before run.",
    "  --run <runId|runDir>   Run directory or run id for answer/resume.",
    "  --answers <json>       Inline JSON answers map for non-interactive ccbridge answer.",
    "  --answers-file <path>  File containing a JSON answers map for non-interactive ccbridge answer.",
    "  -h, --help             Show this help."
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

function parseArgs(argv) {
  const args = {
    command: argv[2]
  };

  if (args.command === "-h" || args.command === "--help") {
    args.help = true;
    args.command = null;
    return args;
  }

  for (let index = 3; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    switch (current) {
      case "--config":
        args.configPath = next;
        index += 1;
        break;
      case "--preset":
        args.preset = next;
        index += 1;
        break;
      case "--task":
        args.task = next;
        index += 1;
        break;
      case "--task-file":
        args.taskFile = next;
        index += 1;
        break;
      case "--workspace":
        args.workspaceDir = next;
        index += 1;
        break;
      case "--artifacts":
        args.artifactsDir = next;
        index += 1;
        break;
      case "--max-rounds":
        args.maxPlanRounds = Number(next);
        index += 1;
        break;
      case "--max-review-rounds":
        args.maxReviewRounds = Number(next);
        index += 1;
        break;
      case "--skip-preflight":
        args.skipPreflight = true;
        break;
      case "--run":
        args.run = next;
        index += 1;
        break;
      case "--answers":
        args.answers = next;
        index += 1;
        break;
      case "--answers-file":
        args.answersFile = next;
        index += 1;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  return args;
}

async function resolveTask(args) {
  if (args.task) {
    return args.task;
  }

  if (args.taskFile) {
    const taskPath = path.resolve(args.taskFile);
    return readFile(taskPath, "utf8");
  }

  throw new Error("Provide either --task or --task-file.");
}

async function resolveAnswers(args) {
  if (args.answers) {
    return JSON.parse(args.answers);
  }

  if (args.answersFile) {
    return JSON.parse(await readFile(path.resolve(args.answersFile), "utf8"));
  }

  throw new Error("Provide either --answers or --answers-file.");
}

async function resolveConfigPath(configPath) {
  if (configPath) {
    return configPath;
  }

  const defaultPath = path.resolve(process.cwd(), "ccbridge.config.json");
  const legacyPath = path.resolve(process.cwd(), "orchestrator.config.json");
  try {
    await access(defaultPath);
    return defaultPath;
  } catch {}

  try {
    await access(legacyPath);
    return legacyPath;
  } catch {}

  return null;
}

async function resolveRunPath(runArg) {
  if (!runArg) {
    throw new Error("Missing required --run option.");
  }

  const directPath = path.resolve(runArg);
  try {
    await access(directPath);
    return directPath;
  } catch {}

  const defaultRunPath = path.resolve(process.cwd(), ".runs", runArg);
  try {
    await access(defaultRunPath);
    return defaultRunPath;
  } catch {}

  throw new Error(`Could not resolve run path from: ${runArg}`);
}

function printPresets() {
  const lines = ["Available presets:"];

  for (const preset of getPresetSummaries()) {
    lines.push(`  ${preset.name}`);
    lines.push(`    ${preset.description}`);
  }

  lines.push("");
  lines.push(`Default preset: balanced`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

function formatDurationMs(durationMs) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (!minutes) {
    return `${totalSeconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function createProgressReporter(output = process.stderr) {
  return (event) => {
    switch (event.type) {
      case "run_started":
        output.write(`\nStarting run ${event.runId}\n`);
        break;
      case "run_resumed":
        output.write(`\nResuming run ${event.runId} at stage ${event.resumedFrom}\n`);
        break;
      case "run_continued":
        output.write(
          `\nContinuing run ${event.runId} with one extra repair round (attempt ${event.nextExecutionAttempt}, max repair rounds now ${event.maxReviewRounds})\n`
        );
        break;
      case "stage_start":
        if (event.stage === "plan") {
          output.write(`\nPlanner round ${event.planRound} started\n`);
          return;
        }

        if (event.stage === "critique") {
          output.write(`\nCritic review for plan round ${event.planRound} started\n`);
          return;
        }

        if (event.stage === "execute") {
          output.write(`\nExecutor attempt ${event.executionAttempt} started\n`);
          return;
        }

        if (event.stage === "review") {
          output.write(`\nReviewer pass ${event.reviewRound} started\n`);
        }
        break;
      case "agent_call_start":
        output.write(`  ${event.roleName} is running ${event.operation}...\n`);
        break;
      case "agent_call_heartbeat":
        output.write(
          `  still waiting on ${event.roleName} ${event.operation} (${formatDurationMs(event.elapsedMs)} elapsed)\n`
        );
        break;
      case "agent_call_done":
        output.write(
          `  ${event.roleName} ${event.operation} finished in ${formatDurationMs(event.elapsedMs)}\n`
        );
        break;
      case "input_requested":
        output.write(
          `  ${event.roleName} needs ${event.questionCount} user answer${event.questionCount === 1 ? "" : "s"}\n`
        );
        break;
      default:
        break;
    }
  };
}

function canUseInteractiveTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function runInteractiveAnswerSubcommand(runPath) {
  const cliEntry = process.argv[1];

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntry, "answer", "--run", runPath], {
      cwd: process.cwd(),
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode ?? 1;
  }
}

async function runInteractiveAnswerFlow(runPath, onProgress) {
  let currentRunPath = runPath;

  while (true) {
    const state = await loadRunState(currentRunPath);
    const answers = await promptForAnswersInteractively({
      pendingInput: state.pendingInput,
      input: process.stdin,
      output: process.stdout
    });
    const summary = await answerAndResumeRun({
      runPath: currentRunPath,
      answers,
      onProgress
    });

    if (summary.status !== "waiting_for_user" || !canUseInteractiveTerminal()) {
      return summary;
    }

    process.stderr.write(
      "\nMore input is needed to continue this run. Continuing interactive answers.\n"
    );
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.command) {
    printHelp();
    return;
  }

  if (!["run", "doctor", "presets", "answer", "resume", "continue"].includes(args.command)) {
    throw new Error(`Unsupported command: ${args.command}`);
  }

  if (args.command === "presets") {
    printPresets();
    return;
  }

  if (args.command === "answer") {
    const runPath = await resolveRunPath(args.run);
    const onProgress = createProgressReporter();
    let summary;

    if (args.answers || args.answersFile) {
      summary = await answerAndResumeRun({
        runPath,
        answers: await resolveAnswers(args),
        onProgress
      });
    } else {
      summary = await runInteractiveAnswerFlow(runPath, onProgress);
    }

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.status === "waiting_for_user") {
      process.stderr.write(renderWaitingForUserHint(summary));
    }
    if (summary.status === "review_changes_requested") {
      process.stderr.write(renderContinueHint(summary));
    }
    return;
  }

  if (args.command === "resume") {
    const runPath = await resolveRunPath(args.run);
    const summary = await resumeRun({
      runPath,
      onProgress: createProgressReporter()
    });
    if (summary.status === "waiting_for_user" && canUseInteractiveTerminal()) {
      process.stderr.write(
        "\nRun paused and needs your input. Opening interactive answers now.\n"
      );
      await runInteractiveAnswerSubcommand(runPath);
      return;
    }

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.status === "waiting_for_user") {
      process.stderr.write(renderWaitingForUserHint(summary));
    }
    if (summary.status === "review_changes_requested") {
      process.stderr.write(renderContinueHint(summary));
    }
    return;
  }

  if (args.command === "continue") {
    const runPath = await resolveRunPath(args.run);
    const summary = await continueReviewRun({
      runPath,
      onProgress: createProgressReporter()
    });
    if (summary.status === "waiting_for_user" && canUseInteractiveTerminal()) {
      process.stderr.write(
        "\nRun paused and needs your input. Opening interactive answers now.\n"
      );
      await runInteractiveAnswerSubcommand(runPath);
      return;
    }

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.status === "waiting_for_user") {
      process.stderr.write(renderWaitingForUserHint(summary));
    }
    if (summary.status === "review_changes_requested") {
      process.stderr.write(renderContinueHint(summary));
    }
    return;
  }

  const configPath = await resolveConfigPath(args.configPath);
  const config = await loadConfig(configPath, {
    preset: args.preset,
    workspaceDir: args.workspaceDir,
    artifactsDir: args.artifactsDir,
    maxPlanRounds: args.maxPlanRounds,
    maxReviewRounds: args.maxReviewRounds
  });

  const preflight = await runPreflight(config);

  if (args.command === "doctor") {
    process.stdout.write(`${formatPreflightReport(preflight)}\n`);
    process.exitCode = preflight.ok ? 0 : 1;
    return;
  }

  if (!args.skipPreflight && !preflight.ok) {
    throw new Error(
      [
        "Preflight failed.",
        formatPreflightReport(preflight),
        "Run `npm run doctor` for the same checks."
      ].join("\n")
    );
  }

  const task = await resolveTask(args);
  const summary = await runOrchestration({
    config,
    task,
    onProgress: createProgressReporter()
  });
  if (summary.status === "waiting_for_user" && canUseInteractiveTerminal()) {
    process.stderr.write(
      "\nRun paused and needs your input. Opening interactive answers now.\n"
    );
    await runInteractiveAnswerSubcommand(summary.runDir);
    return;
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.status === "waiting_for_user") {
    process.stderr.write(renderWaitingForUserHint(summary));
  }
  if (summary.status === "review_changes_requested") {
    process.stderr.write(renderContinueHint(summary));
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
