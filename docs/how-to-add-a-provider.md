# How To Add A Provider

This guide explains how to add a new provider to `ccbridge`.

The current built-in providers are:

- `claude-cli`
- `codex-cli`
- `mock`

The provider layer is intentionally thin. A provider should only:

- accept a prompt and schema from the orchestrator
- call its CLI or API
- write raw logs
- return structured output in the `ccbridge` response envelope

Most orchestration policy belongs above the provider layer, not inside the provider.

## 1. Understand The Provider Contract

Every provider instance is created from a role config and must expose:

```js
class ExampleProvider {
  constructor(config = {}) {}

  async run({
    operation,
    prompt,
    schema,
    workspaceDir,
    runDir,
    roleName,
    maxAgentCallMs,
    onProgress
  }) {}
}
```

The important inputs are:

- `operation`: one of `plan`, `critique`, `execute`, `review`
- `prompt`: the fully rendered prompt string for that role
- `schema`: the strict JSON schema for the expected output
- `workspaceDir`: target repo path
- `runDir`: artifact directory for this run
- `roleName`: `planner`, `critic`, `executor`, or `reviewer`
- `maxAgentCallMs`: per-call timeout budget from the top-level config
- `onProgress`: callback used for terminal progress updates

## 2. Return The Correct Envelope

Providers should return one of these two shapes:

### Normal result

```json
{
  "response_type": "result",
  "result": {
    "...": "schema-defined payload"
  }
}
```

### Human input required

```json
{
  "response_type": "needs_input",
  "input_request": {
    "summary": "Need one user decision before continuing.",
    "questions": [
      {
        "id": "example_question",
        "prompt": "Which option should be used?",
        "input_kind": "single_select",
        "answer_source": "human",
        "required": true,
        "reason": "This changes implementation scope.",
        "options": [
          {
            "id": "safe",
            "label": "Safe option",
            "description": "Smaller, lower-risk change."
          }
        ],
        "min_select": null,
        "max_select": null
      }
    ]
  }
}
```

Important:

- `ccbridge` schemas are strict
- if your provider emits `needs_input`, include all required fields
- when a field is unused, return `null` instead of omitting it

The best reference is the existing prompt/schema pair in:

- `src/prompts.mjs`
- `src/schema.mjs`

## 3. Reuse The Shared Helpers When Possible

If your provider shells out to a CLI, start with the helpers in:

- `src/providers/cli-shared.mjs`

Useful helpers:

- `runCommand(...)`
  Writes raw stdout/stderr logs, emits progress, and throws on non-zero exit
- `parseStructuredOutput(rawText)`
  Tries to recover structured JSON from several common wrapper formats
- `writeSchemaFile(...)`
  Useful when a CLI wants a schema on disk instead of inline

This is the easiest pattern if your provider looks like the existing CLI adapters.

## 4. Create The Provider File

Add a new file in:

```text
src/providers/<name>.mjs
```

Example shape:

```js
import { parseStructuredOutput, runCommand } from "./cli-shared.mjs";

export class ExampleCliProvider {
  constructor(config = {}) {
    this.command = config.command ?? "example-agent";
    this.model = config.model;
    this.extraArgs = config.extraArgs ?? [];
  }

  async run({
    operation,
    prompt,
    schema,
    workspaceDir,
    runDir,
    roleName,
    maxAgentCallMs,
    onProgress
  }) {
    const args = [
      "--json",
      "--schema",
      JSON.stringify(schema),
      ...this.extraArgs
    ];

    if (this.model) {
      args.push("--model", this.model);
    }

    args.push(prompt);

    const { stdout } = await runCommand({
      command: this.command,
      args,
      cwd: workspaceDir,
      rawLogPrefix: `${roleName}-${operation}`,
      runDir,
      timeoutMs: maxAgentCallMs,
      onProgress,
      progressContext: {
        roleName,
        operation
      }
    });

    return parseStructuredOutput(stdout);
  }
}
```

## 5. Register It

Update:

- `src/providers/index.mjs`

Add the import and register the new `config.provider` name in `createProvider(...)`.

## 6. Document The Config Shape

If the provider needs new config keys such as:

- `command`
- `model`
- `sandbox`
- `approvalPolicy`
- `extraArgs`
- API-specific values

document them in:

- `README.md`
- example config files if appropriate

If the provider is intended for real use, also consider adding a preset in:

- `src/presets.mjs`

## 7. Add Tests

At minimum, add:

- a provider unit test if there is non-trivial parsing or argument construction
- a schema/prompt compatibility test if the provider depends on a special output format
- a config or summary test if the provider changes visible CLI behavior

Good reference tests:

- `test/orchestrator.test.mjs`
- `test/summary-output.test.mjs`

If you are only prototyping a provider, add a focused smoke test before trying full real runs.

## 8. Verify With A Real Run

Before considering the provider done:

1. run `npm test`
2. run `npm start -- doctor` if the provider participates in preflight
3. run a small real task against a disposable local repo
4. inspect `.runs/<runId>/raw/` to confirm output and errors are readable

## Practical Rules

- Keep provider logic narrow. Do not move planning or review policy into the provider.
- Prefer structured output from the upstream CLI whenever possible.
- Always preserve raw logs.
- Treat malformed output as a provider concern, not something to hide from the user.
- If the provider cannot safely continue, return `needs_input` instead of guessing.

## Good First Follow-Up

If you add a new provider, also add a short section to the docs describing:

- when someone should use it
- what auth/setup it requires
- what its sharp edges are

That is often more valuable than adding more abstraction.
