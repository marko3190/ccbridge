#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { access, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  promptForAnswersInteractively,
  renderContinueHint,
  renderWaitingForUserHint
} from "./answer-ui.mjs";
import { buildRoleAgentMap } from "./agent-labels.mjs";
import { loadConfig } from "./config.mjs";
import {
  answerAndResumeRun,
  continueReviewRun,
  loadRunState,
  resumeRun,
  runOrchestration
} from "./orchestrator.mjs";
import { formatPreflightReport, runPreflight } from "./preflight.mjs";
import { createProgressReporter } from "./progress-reporter.mjs";
import { getPresetNames, getPresetSummaries } from "./presets.mjs";
import { renderRunSummary } from "./summary-output.mjs";

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
    "  --json                 Print machine-readable JSON instead of the human summary.",
    "  --verbose              Include extra detail in the human summary output.",
    "  -h, --help             Show this help."
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

function requireOptionValue(option, next) {
  if (next === undefined || next.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }

  return next;
}

function parseIntegerOption(option, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${option} requires a non-negative integer`);
  }

  return parsed;
}

export function parseArgs(argv) {
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
        args.configPath = requireOptionValue(current, next);
        index += 1;
        break;
      case "--preset":
        args.preset = requireOptionValue(current, next);
        index += 1;
        break;
      case "--task":
        args.task = requireOptionValue(current, next);
        index += 1;
        break;
      case "--task-file":
        args.taskFile = requireOptionValue(current, next);
        index += 1;
        break;
      case "--workspace":
        args.workspaceDir = requireOptionValue(current, next);
        index += 1;
        break;
      case "--artifacts":
        args.artifactsDir = requireOptionValue(current, next);
        index += 1;
        break;
      case "--max-rounds":
        args.maxPlanRounds = parseIntegerOption(current, requireOptionValue(current, next));
        index += 1;
        break;
      case "--max-review-rounds":
        args.maxReviewRounds = parseIntegerOption(
          current,
          requireOptionValue(current, next)
        );
        index += 1;
        break;
      case "--skip-preflight":
        args.skipPreflight = true;
        break;
      case "--run":
        args.run = requireOptionValue(current, next);
        index += 1;
        break;
      case "--answers":
        args.answers = requireOptionValue(current, next);
        index += 1;
        break;
      case "--answers-file":
        args.answersFile = requireOptionValue(current, next);
        index += 1;
        break;
      case "--json":
        args.json = true;
        break;
      case "--verbose":
        args.verbose = true;
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

function writeSummaryOutput(summary, options = {}) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  process.stdout.write(renderRunSummary(summary, { verbose: options.verbose }));
}

function writeSummaryWithHints(summary, options = {}) {
  writeSummaryOutput(summary, options);
  if (summary.status === "waiting_for_user") {
    process.stderr.write(renderWaitingForUserHint(summary));
  }
  if (summary.status === "review_changes_requested") {
    process.stderr.write(renderContinueHint(summary));
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
    const state = await loadRunState(runPath);
    const onProgress = createProgressReporter(process.stderr, {
      roleAgents: buildRoleAgentMap(state.config)
    });
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

    writeSummaryWithHints(summary, { json: args.json, verbose: args.verbose });
    return;
  }

  if (args.command === "resume") {
    const runPath = await resolveRunPath(args.run);
    const state = await loadRunState(runPath);
    const summary = await resumeRun({
      runPath,
      onProgress: createProgressReporter(process.stderr, {
        roleAgents: buildRoleAgentMap(state.config)
      })
    });
    if (summary.status === "waiting_for_user" && canUseInteractiveTerminal()) {
      process.stderr.write(
        "\nRun paused and needs your input. Opening interactive answers now.\n"
      );
      await runInteractiveAnswerSubcommand(runPath);
      return;
    }

    writeSummaryWithHints(summary, { json: args.json, verbose: args.verbose });
    return;
  }

  if (args.command === "continue") {
    const runPath = await resolveRunPath(args.run);
    const state = await loadRunState(runPath);
    const summary = await continueReviewRun({
      runPath,
      onProgress: createProgressReporter(process.stderr, {
        roleAgents: buildRoleAgentMap(state.config)
      })
    });
    if (summary.status === "waiting_for_user" && canUseInteractiveTerminal()) {
      process.stderr.write(
        "\nRun paused and needs your input. Opening interactive answers now.\n"
      );
      await runInteractiveAnswerSubcommand(runPath);
      return;
    }

    writeSummaryWithHints(summary, { json: args.json, verbose: args.verbose });
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
  const onProgress = createProgressReporter(process.stderr, {
    roleAgents: buildRoleAgentMap(config)
  });
  const summary = await runOrchestration({
    config,
    task,
    onProgress
  });
  if (summary.status === "waiting_for_user" && canUseInteractiveTerminal()) {
    process.stderr.write(
      "\nRun paused and needs your input. Opening interactive answers now.\n"
    );
    await runInteractiveAnswerSubcommand(summary.runDir);
    return;
  }

  writeSummaryWithHints(summary, { json: args.json, verbose: args.verbose });
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
