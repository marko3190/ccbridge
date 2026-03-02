# Architecture

This document explains how `ccbridge` is put together and where to make changes safely.

## High-Level Model

`ccbridge` runs a cooperative agent loop:

1. `planner`
2. `critic`
3. `executor`
4. `reviewer`

Each role is configured independently, but the default model is:

- Claude plans and implements
- Codex critiques and reviews

The orchestrator does not hardcode those providers. It binds roles from config or presets.

## Main Components

### CLI

File: `src/cli.mjs`

Responsibilities:

- parse commands and flags
- load config or presets
- run preflight checks
- start, resume, or answer runs
- continue a run after exhausted review repair rounds
- render terminal progress
- render final human summaries or `--json` output
- hand off to interactive user input when needed

### Orchestrator

File: `src/orchestrator.mjs`

Responsibilities:

- maintain run state
- move the run through stages
- persist artifacts to `.runs/<runId>/`
- pause for user input
- resume from saved state
- drive review repair loops

The orchestrator is intentionally state-machine-like rather than event-broker-based. That keeps runs debuggable and artifact-driven.

### Prompts

File: `src/prompts.mjs`

Responsibilities:

- build role-specific instructions
- keep planning and critique cooperative
- encode the `needs_input` protocol
- pass prior critiques, reviews, and user answers back into later rounds

If you change output expectations, this file usually needs to stay aligned with `src/schema.mjs`.

### Schemas

File: `src/schema.mjs`

Responsibilities:

- define strict JSON contracts for plan, critique, execution, review, and input requests
- keep provider output machine-readable
- enforce a stable handoff format across roles

This is especially important for `codex --output-schema`, which requires strict object schemas.

### Providers

Directory: `src/providers/`

Responsibilities:

- adapt `claude`, `codex`, and `mock` providers to the same interface
- execute CLI commands
- write raw logs
- parse structured output
- emit provider progress signals while a call is in flight

Provider adapters are intentionally thin. Most orchestration policy lives above them.

## Run Lifecycle

Each run starts with a new directory:

```text
.runs/<timestamp>/
```

Typical flow:

1. `plan`
2. `critique`
3. optional extra planning rounds
4. `execute`
5. `review`
6. optional repair loop
7. terminal status

If a role needs human clarification, the run moves into `waiting_for_user` and writes:

- `pending-input.json`
- `input-N.request.json`
- later `input-N.answer.json`

## Artifact Model

Artifacts are a core part of the design. They make runs inspectable after the fact.

Important files:

- `state.json`: full resumable run state
- `summary.json`: final or waiting summary
- `plan.round-N.json`
- `critique.round-N.json`
- `execution.round-N.json`
- `review.round-N.json`
- `raw/<role>-<operation>.stdout.log`
- `raw/<role>-<operation>.stderr.log`

`ccbridge` is intentionally artifact-heavy because agent orchestration is difficult to debug without durable state. The CLI's human-readable terminal summary is derived from the same saved state, while `--json` exposes the machine-readable form directly.

## Human Handoff

The user input protocol is not a side effect of an interactive CLI. It is part of the model contract.

Roles can return:

- `response_type: "result"`
- `response_type: "needs_input"`

`needs_input` pauses the run, records a structured request, and lets the CLI collect answers. Those answers are then injected back into later prompts via `inputHistory`.

## Progress Model

Progress is emitted from the orchestrator and provider layers, then rendered by the CLI.

Current progress events include:

- run started
- run resumed
- run continued after exhausted review repair rounds
- stage start
- provider call start
- provider heartbeat
- provider call completion
- stage result summaries
- input requested

The CLI renders those events as role-aware terminal output such as `Planner (Claude)` or `Reviewer (Codex)`. Interactive terminals get a live spinner/status line; non-interactive terminals fall back to heartbeat lines.

## Design Constraints

`ccbridge` currently optimizes for:

- local execution
- explicit artifacts
- a single run against a single workspace
- predictable debugging
- human-in-the-loop clarification

It does not currently try to be:

- a hosted platform
- a queue-based multi-run scheduler
- a background service
- a full issue/PR lifecycle system

## Where To Change What

If you need to change:

- terminal UX: start in `src/cli.mjs` and `src/answer-ui.mjs`
- role instructions: start in `src/prompts.mjs`
- output format or validation: start in `src/schema.mjs`
- provider invocation behavior: start in `src/providers/`
- orchestration flow or repair loops: start in `src/orchestrator.mjs`

## Practical Rule

When in doubt, keep behavior explicit.

Hidden automation is tempting in agent systems, but `ccbridge` works best when:

- state is written to disk
- transitions are visible
- permissions are obvious
- failures are inspectable
