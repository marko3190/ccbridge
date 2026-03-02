function yesNo(value) {
  return value ? "yes" : "no";
}

function formatDurationMs(durationMs) {
  const totalSeconds = Math.max(0, Math.round((durationMs ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (!minutes) {
    return `${totalSeconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function formatRoleAgents(roleAgents = {}) {
  const lines = ["Agents:"];

  for (const roleName of ["planner", "critic", "executor", "reviewer"]) {
    const entry = roleAgents?.[roleName];
    if (!entry) {
      continue;
    }

    const providerTail = entry.provider ? ` [${entry.provider}]` : "";
    const modelTail = entry.model ? ` model=${entry.model}` : "";
    lines.push(`- ${entry.role}: ${entry.agent}${providerTail}${modelTail}`);
  }

  return lines;
}

function formatTimingBreakdown(summary) {
  const lines = [];
  const roleAgents = summary.roleAgents ?? {};
  const roleTiming = summary.roleTiming ?? {};

  if (typeof summary.totalDurationMs === "number") {
    lines.push(`Total duration: ${formatDurationMs(summary.totalDurationMs)}`);
  }

  const breakdown = [];
  const labels = {
    planner: "rounds",
    critic: "rounds",
    executor: "attempts",
    reviewer: "passes"
  };

  for (const roleName of ["planner", "critic", "executor", "reviewer"]) {
    const timing = roleTiming?.[roleName];
    if (!timing || typeof timing.durationMs !== "number") {
      continue;
    }

    const roleLabel = roleAgents?.[roleName]?.role ?? roleName;
    const agentLabel = roleAgents?.[roleName]?.agent;
    const displayName = agentLabel ? `${roleLabel} (${agentLabel})` : roleLabel;
    const count = timing.calls ?? 0;
    breakdown.push(
      `- ${displayName}: ${count} ${labels[roleName]}, ${formatDurationMs(timing.durationMs)}`
    );
  }

  if (typeof roleTiming.userInputWaitMs === "number" && roleTiming.userInputWaitMs > 0) {
    breakdown.push(`- User input wait: ${formatDurationMs(roleTiming.userInputWaitMs)}`);
  }

  if (!breakdown.length) {
    return lines;
  }

  lines.push("Agent breakdown:");
  lines.push(...breakdown);
  return lines;
}

function formatFiles(files = []) {
  if (!files.length) {
    return ["Files changed: none reported"];
  }

  return ["Files changed:", ...files.map((file) => `- ${file}`)];
}

function formatAnalysisList(title, values = []) {
  if (!values?.length) {
    return [];
  }

  return [title, ...values.map((value) => `- ${value}`)];
}

export function renderRunSummary(summary, options = {}) {
  if (!summary || typeof summary !== "object") {
    return "";
  }

  const lines = [];

  if (summary.workflow === "analysis") {
    switch (summary.status) {
      case "completed":
        lines.push("Analysis completed successfully");
        break;
      case "analysis_rejected":
        lines.push("Analysis stopped: the analysis never reached approval");
        break;
      case "waiting_for_user":
        lines.push("Analysis paused and needs user input");
        break;
      default:
        lines.push(`Analysis status: ${summary.status}`);
        break;
    }

    lines.push("");
    lines.push(...formatTimingBreakdown(summary));
    lines.push(`Analysis approved: ${yesNo(summary.approved)}`);
    lines.push(`Analysis rounds: ${summary.roundsUsed}`);

    if (summary.analysisConfidence) {
      lines.push(`Confidence: ${summary.analysisConfidence}`);
    }

    if (summary.analysisSummary) {
      lines.push("");
      lines.push(`Summary: ${summary.analysisSummary}`);
    }

    if (typeof summary.followUpCount === "number" && summary.followUpCount > 0) {
      lines.push(`Follow-up questions asked: ${summary.followUpCount}`);
    }

    if (
      typeof summary.blockingFindingsCount === "number" &&
      summary.status !== "completed"
    ) {
      lines.push(`Blocking findings: ${summary.blockingFindingsCount}`);
    }

    if (options.verbose && summary.roleAgents) {
      lines.push("");
      lines.push(...formatRoleAgents(summary.roleAgents));
    }

    if (summary.recommendedNextSteps?.length) {
      lines.push("");
      lines.push(...formatAnalysisList("Recommended next steps:", summary.recommendedNextSteps));
    }

    if (summary.openQuestions?.length) {
      lines.push("");
      lines.push(...formatAnalysisList("Open questions:", summary.openQuestions));
    }

    if (options.verbose) {
      if (summary.lastAnalysisFile || summary.lastChallengeFile) {
        lines.push("");
      }
      if (summary.lastAnalysisFile) {
        lines.push(`Last analysis artifact: ${summary.lastAnalysisFile}`);
      }

      if (summary.lastChallengeFile) {
        lines.push(`Last challenge artifact: ${summary.lastChallengeFile}`);
      }
    }

    lines.push("");
    lines.push(`Artifacts: ${summary.runDir}`);
    return `${lines.join("\n")}\n`;
  }

  switch (summary.status) {
    case "completed":
      lines.push("Run completed successfully");
      break;
    case "plan_rejected":
      lines.push("Run stopped: the plan never reached approval");
      break;
    case "review_changes_requested":
      lines.push("Run stopped: review still requests changes");
      break;
    case "waiting_for_user":
      lines.push("Run paused and needs user input");
      break;
    default:
      lines.push(`Run status: ${summary.status}`);
      break;
  }

  lines.push("");
  lines.push(...formatTimingBreakdown(summary));
  lines.push(`Changes implemented: ${yesNo(summary.executionStatus === "completed")}`);
  lines.push(`Plan approved: ${yesNo(summary.approved)}`);
  lines.push(`Plan rounds: ${summary.roundsUsed}`);
  lines.push(`Review rounds: ${summary.reviewRoundsUsed}`);

  if (summary.reviewVerdict) {
    lines.push(`Review verdict: ${summary.reviewVerdict}`);
  }

  if (typeof summary.blockingFindingsCount === "number" && summary.status !== "completed") {
    lines.push(`Blocking findings: ${summary.blockingFindingsCount}`);
  }

  if (typeof summary.testsRunCount === "number" && summary.executionStatus === "completed") {
    lines.push(`Validation commands run: ${summary.testsRunCount}`);
  }

  if (options.verbose && summary.roleAgents) {
    lines.push(...formatRoleAgents(summary.roleAgents));
  }

  lines.push(...formatFiles(summary.filesChanged));

  if (options.verbose) {
    if (summary.lastExecutionFile) {
      lines.push(`Last execution artifact: ${summary.lastExecutionFile}`);
    }

    if (summary.lastReviewFile) {
      lines.push(`Last review artifact: ${summary.lastReviewFile}`);
    }
  }

  lines.push(`Artifacts: ${summary.runDir}`);

  return `${lines.join("\n")}\n`;
}
