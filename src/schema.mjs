function nullable(schema) {
  return {
    anyOf: [schema, { type: "null" }]
  };
}

export const issueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "details", "suggested_fix"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    details: { type: "string" },
    suggested_fix: { type: "string" }
  }
};

export const testRunSchema = {
  type: "object",
  additionalProperties: false,
  required: ["command", "result", "summary"],
  properties: {
    command: { type: "string" },
    result: { enum: ["passed", "failed", "not_run"] },
    summary: { type: "string" }
  }
};

export const revisionNoteSchema = {
  type: "object",
  additionalProperties: false,
  required: ["issue_id", "status", "resolution"],
  properties: {
    issue_id: { type: "string" },
    status: { enum: ["new", "addressed", "deferred"] },
    resolution: { type: "string" }
  }
};

export const reviewFindingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "details", "file"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    details: { type: "string" },
    file: { type: "string" }
  }
};

export const inputOptionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "description"],
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    description: nullable({ type: "string" })
  }
};

export const inputQuestionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "prompt",
    "input_kind",
    "answer_source",
    "reason",
    "placeholder",
    "required",
    "min_select",
    "max_select",
    "options"
  ],
  properties: {
    id: { type: "string" },
    prompt: { type: "string" },
    input_kind: { enum: ["text", "single_select", "multi_select"] },
    answer_source: { enum: ["human"] },
    reason: nullable({ type: "string" }),
    placeholder: nullable({ type: "string" }),
    required: { type: "boolean" },
    min_select: nullable({ type: "integer", minimum: 0 }),
    max_select: nullable({ type: "integer", minimum: 1 }),
    options: nullable({
      type: "array",
      items: inputOptionSchema
    })
  }
};

export const inputRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "questions"],
  properties: {
    summary: { type: "string" },
    questions: {
      type: "array",
      minItems: 1,
      items: inputQuestionSchema
    }
  }
};

export const inputAnswerValueSchema = {
  oneOf: [
    { type: "string" },
    { type: "array", items: { type: "string" } }
  ]
};

export const answerMapSchema = {
  type: "object",
  additionalProperties: inputAnswerValueSchema
};

export const planSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "goal",
    "revision_notes",
    "assumptions",
    "steps",
    "files_to_touch",
    "risks",
    "tests",
    "acceptance_criteria",
    "open_questions",
    "status"
  ],
  properties: {
    goal: { type: "string" },
    revision_notes: {
      type: "array",
      items: revisionNoteSchema
    },
    assumptions: {
      type: "array",
      items: { type: "string" }
    },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "summary", "status"],
        properties: {
          id: { type: "string" },
          summary: { type: "string" },
          status: { enum: ["pending", "blocked", "done"] }
        }
      }
    },
    files_to_touch: {
      type: "array",
      items: { type: "string" }
    },
    risks: {
      type: "array",
      items: { type: "string" }
    },
    tests: {
      type: "array",
      items: { type: "string" }
    },
    acceptance_criteria: {
      type: "array",
      items: { type: "string" }
    },
    open_questions: {
      type: "array",
      items: { type: "string" }
    },
    status: { enum: ["draft", "approved", "needs_revision"] }
  }
};

export const critiqueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["approved", "summary", "blocking_issues", "non_blocking_issues"],
  properties: {
    approved: { type: "boolean" },
    summary: { type: "string" },
    blocking_issues: {
      type: "array",
      items: issueSchema
    },
    non_blocking_issues: {
      type: "array",
      items: issueSchema
    }
  }
};

export const executionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "summary",
    "files_changed",
    "tests_run",
    "plan_deviations",
    "follow_up"
  ],
  properties: {
    status: { enum: ["completed", "blocked", "failed"] },
    summary: { type: "string" },
    files_changed: {
      type: "array",
      items: { type: "string" }
    },
    tests_run: {
      type: "array",
      items: testRunSchema
    },
    plan_deviations: {
      type: "array",
      items: { type: "string" }
    },
    follow_up: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "verdict",
    "summary",
    "blocking_findings",
    "non_blocking_findings"
  ],
  properties: {
    verdict: { enum: ["pass", "changes_requested"] },
    summary: { type: "string" },
    blocking_findings: {
      type: "array",
      items: reviewFindingSchema
    },
    non_blocking_findings: {
      type: "array",
      items: reviewFindingSchema
    }
  }
};

function wrapOperationSchema(resultSchema) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["response_type", "result", "input_request"],
    properties: {
      response_type: { enum: ["result", "needs_input"] },
      result: nullable(resultSchema),
      input_request: nullable(inputRequestSchema)
    }
  };
}

export const schemasByOperation = {
  plan: wrapOperationSchema(planSchema),
  critique: wrapOperationSchema(critiqueSchema),
  execute: wrapOperationSchema(executionSchema),
  review: wrapOperationSchema(reviewSchema)
};
