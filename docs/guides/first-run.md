# First Run Example

This is a minimal first run using `ccbridge` against a local repository.

This guide uses `npm start -- ...` on purpose, so it works even if you have not added `ccbridge` to your shell `PATH` yet.

## 1. Verify The Environment

From the `ccbridge` repo:

```bash
npm start -- doctor
```

You want both CLIs to report as ready before using a real preset.

## 2. Prepare A Target Repo

Your target repo can be any local project. For a minimal test, create a task file in that repo:

```md
Goal:
Add a small settings panel for notification preferences.

Scope:
- frontend only
- do not change backend APIs

Acceptance criteria:
- user can enable or disable email notifications
- current setting is visible on load
- UI remains usable on mobile

Validation:
- run npm test
- run npm run build
```

Save it as `task.md`.

## 3. Start The Run

```bash
npm start -- run \
  --preset balanced \
  --workspace /absolute/path/to/target-repo \
  --task @/absolute/path/to/target-repo/task.md
```

In a healthy run you will see terminal progress such as:

```text
Starting run 2026-03-01T21-00-00.000Z

Planner (Claude) round 1 started
  done: Planner (Claude) is drafting the implementation plan in 38s
  plan ready: 3 steps, 2 files, 1 test
```

## 4. If The Agent Needs Clarification

If the planner or another role needs a human decision, `ccbridge` pauses and asks questions in the terminal.

Typical example:

```text
Run paused and needs your input. Opening interactive answers now.
[1/2] Should this feature be hidden behind a feature flag?
```

Answer directly in the terminal.

If the run happened in a non-interactive environment, answer later with:

```bash
npm start -- answer --run <runId>
```

## 5. Inspect The Outcome

At the end you will get a final summary such as:

```text
Run completed successfully

Changes implemented: yes
Plan approved: yes
Plan rounds: 1
Review rounds: 1
Review verdict: pass
Validation commands run: 2
Files changed:
- src/App.jsx
- src/components/FeaturePanel.jsx
Artifacts: /absolute/path/to/target-repo/.runs/<runId>
```

If you need machine-readable output for scripts, use:

```bash
npm start -- run ... --json
```

If you want a more detailed human summary, including which agent handled each role and the key artifact paths, use:

```bash
npm start -- run ... --verbose
```

Possible terminal statuses:

- `completed`: run finished successfully
- `plan_rejected`: plan never reached approval
- `review_changes_requested`: execution happened, but review still found a blocking issue after the allowed repair passes. You can grant one more repair cycle with `npm start -- continue --run <runId>`
- `waiting_for_user`: human input is required before continuing

## 6. Inspect Artifacts

Every run is saved to:

```text
.runs/<runId>/
```

Common files:

- `summary.json`
- `state.json`
- `plan.round-N.json`
- `critique.round-N.json`
- `execution.round-N.json`
- `review.round-N.json`
- `raw/*.stdout.log`
- `raw/*.stderr.log`

If something goes wrong, start there.

## 7. Recommended First Task Size

For your first real run, use a task that is:

- small
- easy to validate
- unlikely to require migrations or production secrets

Good examples:

- add a small UI state
- improve one API error message flow
- add one narrow test suite
- refactor one isolated helper module

Bad first examples:

- rewrite auth
- change billing logic
- run broad multi-package migrations
- anything requiring prod credentials
