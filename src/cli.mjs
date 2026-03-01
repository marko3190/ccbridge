#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { access, readFile } from "node:fs/promises";
import { loadConfig } from "./config.mjs";
import {
  answerAndResumeRun,
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
    "  ccbridge answer --run <runId|runDir> --answers '<json>'",
    "  ccbridge resume --run <runId|runDir>",
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
    "  --answers <json>       Inline JSON answers map for ccbridge answer.",
    "  --answers-file <path>  File containing a JSON answers map for ccbridge answer.",
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

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.command) {
    printHelp();
    return;
  }

  if (!["run", "doctor", "presets", "answer", "resume"].includes(args.command)) {
    throw new Error(`Unsupported command: ${args.command}`);
  }

  if (args.command === "presets") {
    printPresets();
    return;
  }

  if (args.command === "answer") {
    const runPath = await resolveRunPath(args.run);
    const summary = await answerAndResumeRun({
      runPath,
      answers: await resolveAnswers(args)
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (args.command === "resume") {
    const runPath = await resolveRunPath(args.run);
    const summary = await resumeRun({ runPath });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
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
  const summary = await runOrchestration({ config, task });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
