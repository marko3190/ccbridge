function sanitizeTask(task) {
  return task.trim().replace(/\s+/g, " ").slice(0, 80);
}

export class MockProvider {
  constructor(config = {}) {
    this.name = config.name ?? "mock";
    this.behavior = config.behavior ?? "approve_after_one_revision";
  }

  async run({ operation, payload }) {
    switch (operation) {
      case "analyze":
        return this.#wrapResult(this.#analyze(payload));
      case "challenge":
        return this.#wrapResult(this.#challenge(payload));
      case "plan":
        return this.#wrapResult(this.#plan(payload));
      case "critique":
        return this.#wrapResult(this.#critique(payload));
      case "execute":
        if (this.behavior === "needs_input_once" && !payload.inputHistory?.length) {
          return {
            response_type: "needs_input",
            input_request: {
              summary: "Need one user decision before continuing.",
              questions: [
                {
                  id: "allowed_scopes",
                  prompt: "Which scopes are allowed for this change?",
                  input_kind: "multi_select",
                  answer_source: "human",
                  required: true,
                  min_select: 1,
                  max_select: 2,
                  options: [
                    { id: "docs", label: "Docs only" },
                    { id: "tests", label: "Tests allowed" }
                  ]
                }
              ]
            }
          };
        }
        return this.#wrapResult(this.#execute(payload));
      case "review":
        return this.#wrapResult(this.#review(payload));
      default:
        throw new Error(`Unsupported mock operation: ${operation}`);
    }
  }

  #wrapResult(result) {
    return {
      response_type: "result",
      result
    };
  }

  #plan(payload) {
    const task = sanitizeTask(payload.task);
    const status = payload.critique?.approved ? "approved" : payload.critique ? "needs_revision" : "draft";
    const revisionNotes = payload.critique
      ? payload.critique.blocking_issues.map((issue) => ({
          issue_id: issue.id,
          status: "addressed",
          resolution: `Addressed ${issue.title.toLowerCase()} in the revised plan.`
        }))
      : [];

    return {
      goal: `Implement task: ${task}`,
      revision_notes: revisionNotes,
      assumptions: [
        "Repository has a working test command.",
        "The feature can be completed within the listed files."
      ],
      steps: [
        { id: "step-1", summary: "Inspect the relevant code paths.", status: "pending" },
        { id: "step-2", summary: "Implement the smallest safe change set.", status: "pending" },
        { id: "step-3", summary: "Run focused verification.", status: "pending" }
      ],
      files_to_touch: ["src/example.js", "test/example.test.js"],
      risks: ["Existing edge cases may not be covered by current tests."],
      tests: ["npm test -- --runInBand"],
      acceptance_criteria: ["Behavior matches the task.", "Tests pass."],
      open_questions: [],
      status
    };
  }

  #analyze(payload) {
    const task = sanitizeTask(payload.task);
    const status = payload.challenge?.approved
      ? "approved"
      : payload.challenge
        ? "needs_revision"
        : "draft";
    const revisionNotes = payload.challenge
      ? payload.challenge.blocking_issues.map((issue) => ({
          issue_id: issue.id,
          status: "addressed",
          resolution: `Addressed ${issue.title.toLowerCase()} in the revised analysis.`
        }))
      : [];

    return {
      summary: `Analysis for task: ${task}`,
      revision_notes: revisionNotes,
      confirmed_findings: ["The current evidence supports one main diagnosis."],
      likely_causes: ["The behavior is consistent with the primary hypothesis."],
      evidence: ["Repository inspection supports the reported pattern."],
      affected_areas: ["src/example.js"],
      open_questions: payload.followUpQuestions?.length
        ? []
        : ["A real run may need one follow-up question."],
      recommended_next_steps: [
        "Validate the hypothesis in a targeted implementation task if the user wants code changes."
      ],
      confidence: payload.challenge?.approved ? "high" : "medium",
      status
    };
  }

  #challenge(payload) {
    const round = payload.round ?? 1;
    const shouldApprove = this.behavior === "always_approve" || round > 1;

    return {
      approved: shouldApprove,
      summary: shouldApprove
        ? "Analysis is strong enough to guide the next decision."
        : "Analysis needs one revision to tighten evidence and recommended next steps.",
      blocking_issues: shouldApprove
        ? []
        : [
            {
              id: "analysis-evidence",
              title: "Evidence is too thin",
              details: "The analysis should better connect repository evidence to the main hypothesis.",
              suggested_fix: "Expand the evidence and likely_causes sections."
            }
          ],
      non_blocking_issues: shouldApprove
        ? []
        : [
            {
              id: "analysis-follow-up",
              title: "Could call out one follow-up question",
              details: "The analysis could mention what to verify next if the user wants to implement a fix.",
              suggested_fix: "Add a more explicit recommended next step."
            }
          ]
    };
  }

  #critique(payload) {
    const round = payload.round ?? 1;
    const shouldApprove = this.behavior === "always_approve" || round > 1;

    return {
      approved: shouldApprove,
      summary: shouldApprove
        ? "Plan is concrete enough to implement."
        : "Plan needs one revision to clarify risks and verification scope.",
      blocking_issues: shouldApprove
        ? []
        : [
            {
              id: "risk-coverage",
              title: "Risk mitigation is too thin",
              details: "The plan should call out how regressions will be checked.",
              suggested_fix: "Expand the test and acceptance sections."
            }
          ],
      non_blocking_issues: shouldApprove
        ? []
        : [
            {
              id: "file-scope",
              title: "File scope may be incomplete",
              details: "Related fixtures or docs may also need updates.",
              suggested_fix: "Reconfirm the impacted files before implementation."
            }
          ]
    };
  }

  #execute() {
    return {
      status: "completed",
      summary: "Mock executor completed without touching the workspace.",
      files_changed: [],
      tests_run: [
        {
          command: "npm test -- --runInBand",
          result: "not_run",
          summary: "Mock mode does not execute tests."
        }
      ],
      plan_deviations: [],
      follow_up: []
    };
  }

  #review(payload) {
    const reviewRound = payload.reviewRound ?? 1;
    const requestChangesOnce = this.behavior === "request_changes_once";
    const requestChangesTwice = this.behavior === "request_changes_twice";

    if (requestChangesOnce && reviewRound === 1) {
      return {
        verdict: "changes_requested",
        summary: "Mock reviewer requests one repair round before approval.",
        blocking_findings: [
          {
            id: "mock-finding",
            title: "Mock blocking finding",
            details: "Add one follow-up adjustment before considering the task complete.",
            file: "README.md"
          }
        ],
        non_blocking_findings: []
      };
    }

    if (requestChangesTwice && reviewRound <= 2) {
      return {
        verdict: "changes_requested",
        summary: "Mock reviewer requests two repair rounds before approval.",
        blocking_findings: [
          {
            id: `mock-finding-${reviewRound}`,
            title: `Mock blocking finding ${reviewRound}`,
            details: "Add one more follow-up adjustment before considering the task complete.",
            file: "README.md"
          }
        ],
        non_blocking_findings: []
      };
    }

    return {
      verdict: "pass",
      summary: "Mock reviewer found no blocking issues.",
      blocking_findings: [],
      non_blocking_findings: []
    };
  }
}
