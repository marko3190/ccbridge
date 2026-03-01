function section(title, value) {
  return `${title}:\n${value}`;
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function formatIssueList(issues = []) {
  if (!issues.length) {
    return "None.";
  }

  return issues
    .map((issue) => {
      const tail = issue.suggested_fix
        ? `Suggested fix: ${issue.suggested_fix}`
        : issue.file
          ? `File: ${issue.file}`
          : "No extra metadata.";

      return `- ${issue.id}: ${issue.title}\n  Details: ${issue.details}\n  ${tail}`;
    })
    .join("\n");
}

function summarizeCritiqueHistory(critiqueHistory = []) {
  if (!critiqueHistory.length) {
    return "No prior critiques.";
  }

  return critiqueHistory
    .map(
      (entry) =>
        [
          `Round ${entry.round}: ${entry.summary}`,
          `Blocking issues: ${entry.blocking_issues.length}`,
          formatIssueList(entry.blocking_issues),
          `Non-blocking issues: ${entry.non_blocking_issues.length}`
        ].join("\n")
    )
    .join("\n\n");
}

function summarizeReviewHistory(reviewHistory = []) {
  if (!reviewHistory.length) {
    return "No prior reviews.";
  }

  return reviewHistory
    .map(
      (entry) =>
        [
          `Review round ${entry.review_round}: ${entry.summary}`,
          `Verdict: ${entry.verdict}`,
          `Blocking findings: ${entry.blocking_findings.length}`,
          formatIssueList(entry.blocking_findings),
          `Non-blocking findings: ${entry.non_blocking_findings.length}`
        ].join("\n")
    )
    .join("\n\n");
}

function summarizeInputHistory(inputHistory = []) {
  if (!inputHistory.length) {
    return "No prior user input.";
  }

  return inputHistory
    .map((entry) => {
      const answers = Object.entries(entry.answers ?? {})
        .map(([id, value]) => `- ${id}: ${Array.isArray(value) ? value.join(", ") : value}`)
        .join("\n");

      return [
        `Stage: ${entry.stage}`,
        `Role: ${entry.role_name}`,
        `Summary: ${entry.summary}`,
        "Answers:",
        answers || "- None."
      ].join("\n");
    })
    .join("\n\n");
}

function buildInputProtocolInstructions() {
  return [
    "If you are truly blocked on a human decision, do not ask in free-form prose and do not simulate an interactive terminal choice.",
    "Instead return a JSON envelope with response_type='needs_input' and an input_request object.",
    "Use input_kind='single_select' for one choice, input_kind='multi_select' for checkbox-style multiple choice, and input_kind='text' for free text.",
    "Because the schema is strict, always include every field in the envelope and every question/option object.",
    "Set unused fields to null instead of omitting them. For example: result=null on needs_input, input_request=null on result, options=null for text questions, min_select/max_select=null when not applicable, description=null when an option has no extra description.",
    "Keep questions minimal and only ask what is necessary to continue safely.",
    "If you can infer the answer from the repository, the task, or prior user answers, do not ask."
  ].join("\n");
}

export function buildPlanPrompt({
  task,
  workspaceDir,
  previousPlan,
  critique,
  critiqueHistory,
  inputHistory,
  round,
  maxPlanRounds
}) {
  const instructions = [
    "You are the planner agent in a multi-agent coding orchestrator.",
    "You share the same delivery goal as the critic.",
    "Produce an implementation plan only.",
    "Do not write code.",
    "Be concrete about files, tests, risks, and acceptance criteria.",
    "Optimize for convergence: preserve the valid core of the prior plan and patch blockers instead of rewriting the approach from scratch.",
    "Keep the plan minimal but executable. Do not add speculative work just to preempt every hypothetical objection.",
    "Always populate revision_notes. On round 1 use an empty array. On later rounds include one entry for every blocking issue from the latest critique, reusing the exact issue_id and explaining how it was addressed or why it was deferred.",
    "If a prior blocker should become non-blocking, say so explicitly in revision_notes and keep the plan focused on the primary task.",
    "If critique is supplied, revise the previous plan instead of replacing the task with a brand new approach.",
    buildInputProtocolInstructions(),
    "Return JSON only that matches the provided schema."
  ].join("\n");

  const blocks = [
    section("Planner instructions", instructions),
    section("Workspace", workspaceDir),
    section("Task", task)
  ];

  if (typeof round === "number") {
    blocks.push(section("Round", String(round)));
  }

  if (typeof maxPlanRounds === "number") {
    blocks.push(section("Max plan rounds", String(maxPlanRounds)));
  }

  if (previousPlan) {
    blocks.push(section("Previous plan", json(previousPlan)));
  }

  if (critique) {
    blocks.push(section("Critique to address", json(critique)));
    blocks.push(section("Latest blocking issues", formatIssueList(critique.blocking_issues)));
  }

  if (critiqueHistory?.length) {
    blocks.push(section("Critique history", summarizeCritiqueHistory(critiqueHistory)));
  }

  if (inputHistory?.length) {
    blocks.push(section("Resolved user input", summarizeInputHistory(inputHistory)));
  }

  return blocks.join("\n\n");
}

export function buildCritiquePrompt({
  task,
  workspaceDir,
  plan,
  round,
  maxPlanRounds,
  critiqueHistory,
  inputHistory
}) {
  const instructions = [
    "You are the critic agent in a multi-agent coding orchestrator.",
    "You share the same delivery goal as the planner: reach an implementable, low-risk plan quickly.",
    "Review the proposed implementation plan.",
    "Do not rewrite the full plan.",
    "Use a high bar for blocking issues.",
    "A blocking issue should exist only when the plan would likely cause incorrect implementation, unsafe edits, major scope drift, or inability to validate the primary task.",
    "Do not block on wording, optional polish, exhaustive documentation, speculative edge cases, or concerns better caught during execution or review.",
    "If the planner addressed a previous blocking issue well enough, do not reopen it with a renamed variant.",
    "Prefer reusing existing issue ids when the same blocker persists.",
    "If the plan is implementable and the remaining concerns are survivable or reviewable later, approve it and move those concerns to non_blocking_issues.",
    buildInputProtocolInstructions(),
    "Return JSON only that matches the provided schema."
  ];

  if (round > 1) {
    instructions.push(
      "You are reviewing a revision. Compare it against prior critiques before inventing new blockers."
    );
  }

  if (typeof maxPlanRounds === "number" && round === maxPlanRounds) {
    instructions.push(
      "This is the final planning round. Reject only for material blockers that would make execution unsafe or very likely wrong."
    );
  }

  return [
    section(
      "Critic instructions",
      instructions.join("\n")
    ),
    section("Workspace", workspaceDir),
    section("Task", task),
    section("Plan round", String(round)),
    section("Max plan rounds", String(maxPlanRounds)),
    section(
      "Consensus rubric",
      [
        "Approve when the plan is good enough to execute safely, even if a few non-critical concerns remain.",
        "Keep blocking_issues short and stable across rounds.",
        "Use non_blocking_issues for improvements that can be handled during execution, review, or follow-up work."
      ].join("\n")
    ),
    critiqueHistory?.length
      ? section("Prior critique history", summarizeCritiqueHistory(critiqueHistory))
      : section("Prior critique history", "No prior critiques."),
    inputHistory?.length
      ? section("Resolved user input", summarizeInputHistory(inputHistory))
      : section("Resolved user input", "No prior user input."),
    section("Plan under review", json(plan))
  ].join("\n\n");
}

export function buildExecutionPrompt({
  task,
  workspaceDir,
  plan,
  executionAttempt,
  maxReviewRounds,
  latestReview,
  reviewHistory,
  latestExecution,
  inputHistory
}) {
  const instructions = [
    "You are the executor agent in a multi-agent coding orchestrator.",
    "Implement the approved plan in the workspace.",
    "Run relevant validation where practical.",
    "Avoid scope creep.",
    "If you must deviate from the plan, record the deviation in the JSON response.",
    "If review feedback is supplied, fix the blocking findings with the smallest safe change set instead of rewriting completed work.",
    "Treat non-blocking findings as optional unless they naturally fit into the repair.",
    buildInputProtocolInstructions(),
    "Return JSON only that matches the provided schema."
  ];

  if (executionAttempt > 1) {
    instructions.push(
      "This is a repair attempt after review. Focus on resolving the latest blocking findings and preserve already-correct changes."
    );
  }

  const sections = [
    section(
      "Executor instructions",
      instructions.join("\n")
    ),
    section("Workspace", workspaceDir),
    section("Task", task),
    section("Approved plan", json(plan)),
    section("Execution attempt", String(executionAttempt)),
    section("Max review repair rounds", String(maxReviewRounds))
  ];

  if (latestExecution) {
    sections.push(section("Previous execution summary", json(latestExecution)));
  }

  if (latestReview) {
    sections.push(section("Latest review to address", json(latestReview)));
    sections.push(
      section("Latest blocking findings", formatIssueList(latestReview.blocking_findings))
    );
  }

  if (reviewHistory?.length) {
    sections.push(section("Review history", summarizeReviewHistory(reviewHistory)));
  }

  if (inputHistory?.length) {
    sections.push(section("Resolved user input", summarizeInputHistory(inputHistory)));
  }

  return sections.join("\n\n");
}

export function buildReviewPrompt({
  task,
  workspaceDir,
  plan,
  execution,
  reviewRound,
  maxReviewRounds,
  reviewHistory,
  inputHistory
}) {
  const instructions = [
    "You are the reviewer agent in a multi-agent coding orchestrator.",
    "Review the current workspace changes against the approved plan.",
    "Prioritize behavioral bugs, regressions, and missing tests.",
    "Ignore nits unless they materially impact correctness or maintainability.",
    "If a prior blocking finding has been fixed, do not reopen it under a new label.",
    "Use blocking findings only for issues that should be fixed before considering the task complete.",
    buildInputProtocolInstructions(),
    "Return JSON only that matches the provided schema."
  ];

  if (reviewRound > 1) {
    instructions.push(
      "This is a follow-up review after a repair. Focus on unresolved blockers and newly introduced regressions."
    );
  }

  if (typeof maxReviewRounds === "number" && reviewRound === maxReviewRounds + 1) {
    instructions.push(
      "This is the final allowed review pass. Request changes only for material correctness or validation issues."
    );
  }

  const sections = [
    section(
      "Reviewer instructions",
      instructions.join("\n")
    ),
    section("Workspace", workspaceDir),
    section("Task", task),
    section("Approved plan", json(plan)),
    section("Execution summary", json(execution)),
    section("Review round", String(reviewRound)),
    section("Max review repair rounds", String(maxReviewRounds))
  ];

  if (reviewHistory?.length) {
    sections.push(section("Prior review history", summarizeReviewHistory(reviewHistory)));
  }

  if (inputHistory?.length) {
    sections.push(section("Resolved user input", summarizeInputHistory(inputHistory)));
  }

  return sections.join("\n\n");
}
