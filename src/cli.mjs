#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { access, readFile } from "node:fs/promises";
import { loadConfig } from "./config.mjs";
import { runOrchestration } from "./orchestrator.mjs";
import { formatPreflightReport, runPreflight } from "./preflight.mjs";

function printHelp() {
  const lines = [
    "Usage:",
    "  ccbridge run --task \"<task>\"",
    "  ccbridge run --task-file <path>",
    "  ccbridge doctor",
    "",
    "Options:",
    "  --config <path>        Path to ccbridge config JSON. Defaults to ./ccbridge.config.json.",
    "  --task <text>          Task to give the planner.",
    "  --task-file <path>     Read task from a file.",
    "  --workspace <path>     Override workspaceDir from config.",
    "  --artifacts <path>     Override artifactsDir from config.",
    "  --max-rounds <n>       Override maxPlanRounds from config.",
    "  --max-review-rounds <n> Override maxReviewRounds from config.",
    "  --skip-preflight       Skip auth and binary checks before run.",
    "  -h, --help             Show this help."
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

function parseArgs(argv) {
  const args = {
    command: argv[2]
  };

  for (let index = 3; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    switch (current) {
      case "--config":
        args.configPath = next;
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

  await access(legacyPath);
  return legacyPath;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.command) {
    printHelp();
    return;
  }

  if (!["run", "doctor"].includes(args.command)) {
    throw new Error(`Unsupported command: ${args.command}`);
  }

  const configPath = await resolveConfigPath(args.configPath);
  const config = await loadConfig(configPath, {
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
