import process from "node:process";
import { formatRoleWithAgent } from "./agent-labels.mjs";

const SPINNER_FRAMES = ["-", "\\", "|", "/"];

export function formatDurationMs(durationMs) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (!minutes) {
    return `${totalSeconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeSummary(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text.trim().replace(/\s+/g, " ");
}

function wrapText(text, width) {
  const normalized = normalizeSummary(text);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function buildStageHeader(event, roleAgents) {
  switch (event.stage) {
    case "analyze":
      return `\n${formatRoleWithAgent("planner", roleAgents)} analysis round ${event.analysisRound} started\n`;
    case "challenge":
      return `\n${formatRoleWithAgent("critic", roleAgents)} challenge for analysis round ${event.analysisRound} started\n`;
    case "plan":
      return `\n${formatRoleWithAgent("planner", roleAgents)} round ${event.planRound} started\n`;
    case "critique":
      return `\n${formatRoleWithAgent("critic", roleAgents)} review for plan round ${event.planRound} started\n`;
    case "execute":
      return `\n${formatRoleWithAgent("executor", roleAgents)} attempt ${event.executionAttempt} started\n`;
    case "review":
      return `\n${formatRoleWithAgent("reviewer", roleAgents)} pass ${event.reviewRound} started\n`;
    default:
      return "";
  }
}

function describeOperation(event, roleAgents) {
  const roleLabel = formatRoleWithAgent(event.roleName, roleAgents);

  if (event.roleName === "planner" && event.operation === "plan") {
    return `${roleLabel} is drafting the implementation plan`;
  }

  if (event.roleName === "planner" && event.operation === "analyze") {
    return `${roleLabel} is building the analysis`;
  }

  if (event.roleName === "critic" && event.operation === "critique") {
    return `${roleLabel} is checking plan risks and validation`;
  }

  if (event.roleName === "critic" && event.operation === "challenge") {
    return `${roleLabel} is stress-testing the analysis`;
  }

  if (event.roleName === "executor" && event.operation === "execute") {
    return event.executionAttempt > 1
      ? `${roleLabel} is applying review fixes`
      : `${roleLabel} is implementing the approved plan`;
  }

  if (event.roleName === "reviewer" && event.operation === "review") {
    return `${roleLabel} is reviewing the current workspace`;
  }

  return `${roleLabel} is running ${event.operation}`;
}

function buildStageSummary(event) {
  switch (event.stage) {
    case "analyze":
      return `  analysis ready: ${pluralize(event.fileCount, "affected area")}, ${pluralize(event.testCount, "next step")}`;
    case "challenge":
      if (event.approved) {
        return `  challenge approved the analysis${event.nonBlockingCount ? ` with ${pluralize(event.nonBlockingCount, "non-blocking note")}` : ""}`;
      }
      return `  challenge requested changes: ${pluralize(event.blockingCount, "blocker")}${event.nonBlockingCount ? `, ${pluralize(event.nonBlockingCount, "non-blocking note")}` : ""}`;
    case "plan":
      return `  plan ready: ${pluralize(event.stepCount, "step")}, ${pluralize(event.fileCount, "file")}, ${pluralize(event.testCount, "test")}`;
    case "critique":
      if (event.approved) {
        return `  critique approved the plan${event.nonBlockingCount ? ` with ${pluralize(event.nonBlockingCount, "non-blocking note")}` : ""}`;
      }
      return `  critique requested changes: ${pluralize(event.blockingCount, "blocker")}${event.nonBlockingCount ? `, ${pluralize(event.nonBlockingCount, "non-blocking note")}` : ""}`;
    case "execute":
      return `  execution summary: ${pluralize(event.fileCount, "file")} changed, ${pluralize(event.testsRunCount, "validation command")} run`;
    case "review":
      if (event.verdict === "pass") {
        return `  review passed${event.nonBlockingCount ? ` with ${pluralize(event.nonBlockingCount, "non-blocking note")}` : ""}`;
      }
      return `  review requested changes: ${pluralize(event.blockingCount, "blocking finding")}${event.nonBlockingCount ? `, ${pluralize(event.nonBlockingCount, "non-blocking note")}` : ""}`;
    default:
      return "";
  }
}

export function createProgressReporter(output = process.stderr, options = {}) {
  const interactive = Boolean(output?.isTTY);
  const summaryWidth = Math.max(60, (output?.columns ?? 100) - 12);
  const roleAgents = options.roleAgents ?? {};
  let liveStatus = null;
  let spinnerTimer = null;
  let spinnerIndex = 0;

  function clearLiveLine() {
    if (interactive) {
      output.write("\r\x1b[2K");
    }
  }

  function renderLiveLine() {
    if (!interactive || !liveStatus) {
      return;
    }

    const frame = SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length];
    const elapsed = formatDurationMs(Date.now() - liveStatus.startedAt);
    clearLiveLine();
    output.write(`  ${frame} ${liveStatus.label} (${elapsed})`);
  }

  function startLiveStatus(event) {
    stopLiveStatus();
    liveStatus = {
      label: event.labelOverride ?? describeOperation(event, roleAgents),
      startedAt: Date.now()
    };
    spinnerIndex = 0;
    renderLiveLine();
    spinnerTimer = setInterval(() => {
      spinnerIndex += 1;
      renderLiveLine();
    }, 250);
    spinnerTimer.unref?.();
  }

  function stopLiveStatus(finalLine = null) {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }

    if (interactive && liveStatus) {
      clearLiveLine();
      if (finalLine) {
        output.write(`${finalLine}\n`);
      }
    } else if (finalLine) {
      output.write(`${finalLine}\n`);
    }

    liveStatus = null;
  }

  function writeLine(text = "") {
    if (liveStatus) {
      stopLiveStatus();
    }
    output.write(`${text}\n`);
  }

  return (event) => {
    switch (event.type) {
      case "run_started":
        writeLine(`\nStarting run ${event.runId}`);
        break;
      case "run_resumed":
        writeLine(`\nResuming run ${event.runId} at stage ${event.resumedFrom}`);
        break;
      case "run_continued":
        writeLine(
          `\nContinuing run ${event.runId} with one extra repair round (attempt ${event.nextExecutionAttempt}, max repair rounds now ${event.maxReviewRounds})`
        );
        break;
      case "stage_start":
        stopLiveStatus();
        output.write(buildStageHeader(event, roleAgents));
        break;
      case "agent_call_start":
        startLiveStatus({
          ...event,
          labelOverride: describeOperation(event, roleAgents)
        });
        break;
      case "agent_call_heartbeat":
        if (!interactive) {
          output.write(
            `  still working: ${describeOperation(event, roleAgents)} (${formatDurationMs(event.elapsedMs)} elapsed)\n`
          );
        }
        break;
      case "agent_call_done":
        stopLiveStatus(
          `  done: ${describeOperation(event, roleAgents)} in ${formatDurationMs(event.elapsedMs)}`
        );
        break;
      case "stage_result": {
        const summaryLine = buildStageSummary(event);
        if (summaryLine) {
          writeLine(summaryLine);
        }
        const detailLines = wrapText(event.summary, summaryWidth);
        if (detailLines.length) {
          writeLine(`  summary: ${detailLines[0]}`);
          for (const line of detailLines.slice(1)) {
            writeLine(`           ${line}`);
          }
        }
        break;
      }
      case "input_requested":
        writeLine(
          `  ${event.roleName} needs ${event.questionCount} user answer${event.questionCount === 1 ? "" : "s"}`
        );
        break;
      default:
        break;
    }
  };
}
