# Command Cheat Sheet

Copy-paste commands for `ccbridge`.

This assumes you already installed:

```bash
npm install -g ccbridge-cli
```

## Quick Start

Check the installed version:

```bash
ccbridge --version
```

Enable completion for `zsh`:

```bash
ccbridge setup zsh && source ~/.zshrc
```

Enable completion for `bash`:

```bash
ccbridge setup bash && source ~/.bashrc
```

Check the local environment:

```bash
ccbridge doctor
```

List presets:

```bash
ccbridge presets
```

## Standard Implementation Run

Run a task file in the current repo:

```bash
cd /path/to/project && ccbridge run --preset balanced --task @plan.md
```

Run an inline task:

```bash
cd /path/to/project && ccbridge run --preset balanced --task "Add a small UI change and run the relevant tests."
```

Run a task in the real `spicy-glass` app:

```bash
cd /path/to/spicy-glass && ccbridge run --preset balanced --task @task-1.txt
```

## Analysis-First Workflow

Run analysis only, with no code changes:

```bash
cd /path/to/project && ccbridge analyze --preset balanced --task @analysis-task.txt
```

Ask a follow-up question on a completed analysis:

```bash
cd /path/to/project && ccbridge ask --run <runId> --question "Do you recommend fixing only the main view, or also the compare view?"
```

Implement using a previous analysis as context:

```bash
cd /path/to/project && ccbridge run --preset balanced --from-analysis <runId> --task @fix-from-analysis.txt
```

## Human Handoff

If a run pauses and needs an answer from the user:

```bash
ccbridge answer --run <runId>
```

If answers were already recorded but the process stopped:

```bash
ccbridge resume --run <runId>
```

If review ended with `review_changes_requested` after exhausting repair rounds:

```bash
ccbridge continue --run <runId>
```

## Technical Output

Machine-readable JSON:

```bash
cd /path/to/project && ccbridge run --preset balanced --task @plan.md --json
```

More detailed human-readable output:

```bash
cd /path/to/project && ccbridge run --preset balanced --task @plan.md --verbose
```

## Useful Task Alias Examples

Task from a file:

```bash
ccbridge run --preset balanced --task @task-1.txt
```

Task from a subdirectory:

```bash
ccbridge run --preset balanced --task @docs/tasks/fix-search.md
```

Literal text starting with `@`:

```bash
ccbridge run --preset balanced --task @@write a literal @ sign at the beginning
```

## Find The Latest Run

Latest runs in the repo:

```bash
ls -1 .runs | tail -n 5
```

Latest mock runs:

```bash
ls -1 .runs-mock | tail -n 5
```

## Useful Artifact Paths

Summary from the last run:

```bash
cat .runs/<runId>/summary.json
```

Run state:

```bash
cat .runs/<runId>/state.json
```

Latest review artifact:

```bash
cat .runs/<runId>/review.round-1.json
```

## npm Update

Update to the latest version:

```bash
npm install -g ccbridge-cli@latest
```

Check the latest npm version:

```bash
npm view ccbridge-cli version
```

## If `Claude` Is Not Logged In

Login:

```bash
claude auth login
```

Status:

```bash
claude auth status
```

Run preflight again:

```bash
ccbridge doctor
```

## If You Do Not Want To Use The Global Install

Run from the `ccbridge` repo:

```bash
cd /path/to/ccbridge && npm start -- run --preset balanced --workspace /path/to/project --task @/path/to/project/plan.md
```

Run analysis from the `ccbridge` repo:

```bash
cd /path/to/ccbridge && npm start -- analyze --preset balanced --workspace /path/to/project --task @/path/to/project/analysis-task.txt
```
