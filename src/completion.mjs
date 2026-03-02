import { getPresetSummaries } from "./presets.mjs";

function escapeSingleQuotes(value) {
  return value.replaceAll("'", "'\\''");
}

function getPresetEntries() {
  return getPresetSummaries();
}

export function renderZshCompletion() {
  const presetEntries = getPresetEntries()
    .map(
      (preset) =>
        `    '${escapeSingleQuotes(preset.name)}:${escapeSingleQuotes(preset.description)}'`
    )
    .join("\n");

  return `#compdef ccbridge

local context state line
typeset -A opt_args

local -a _ccbridge_commands
_ccbridge_commands=(
  'run:Start a new orchestration run'
  'doctor:Run preflight checks'
  'presets:List built-in presets'
  'answer:Answer pending human input for a run'
  'resume:Resume a paused run'
  'continue:Grant one more repair loop after review exhaustion'
  'completion:Print shell completion setup'
  'setup:Install shell completion into your rc file'
)

local -a _ccbridge_presets
_ccbridge_presets=(
${presetEntries}
)

_ccbridge_task_value() {
  if [[ "$PREFIX" == @* ]]; then
    compset -P '@'
    _files
    return
  fi

  _message 'task text'
}

case "$words[2]" in
  run)
    _arguments -s \\
      '--config[path to ccbridge config JSON]:config file:_files' \\
      '--preset[preset role layout]:preset:->preset' \\
      '--task[task text or @file]:task:_ccbridge_task_value' \\
      '--task-file[read task from a file]:task file:_files' \\
      '--workspace[override workspaceDir]:workspace:_files -/' \\
      '--artifacts[override artifactsDir]:artifacts path:_files -/' \\
      '--max-rounds[override max plan rounds]:round count:' \\
      '--max-review-rounds[override max review rounds]:review count:' \\
      '--skip-preflight[skip auth and binary checks before run]' \\
      '--json[print machine-readable JSON]' \\
      '--verbose[include extra human summary detail]' && return
    ;;
  answer|resume|continue)
    _arguments -s \\
      '--run[run directory or run id]:run path:_files -/' \\
      '--answers[inline JSON answers map]' \\
      '--answers-file[file containing JSON answers]:answers file:_files' \\
      '--json[print machine-readable JSON]' \\
      '--verbose[include extra human summary detail]' && return
    ;;
  doctor)
    _arguments -s \\
      '--config[path to ccbridge config JSON]:config file:_files' \\
      '--preset[preset role layout]:preset:->preset' && return
    ;;
  presets)
    _arguments -s && return
    ;;
  completion|setup)
    _arguments -s '1:shell:(zsh bash)' && return
    ;;
esac

_arguments -C '1:command:->command' '*::arg:->args'

case "$state" in
  command)
    _describe -t commands 'ccbridge command' _ccbridge_commands
    ;;
  preset)
    _describe -t presets 'ccbridge preset' _ccbridge_presets
    ;;
esac
`;
}

export function renderBashCompletion() {
  const presetWords = getPresetEntries()
    .map((preset) => preset.name)
    .join(" ");

  return `_ccbridge_task_value() {
  local cur="$1"

  if [[ "$cur" == @* ]]; then
    local partial="\${cur#@}"
    local IFS=$'\\n'
    local matches=($(compgen -f -- "$partial"))
    COMPREPLY=()

    local match
    for match in "\${matches[@]}"; do
      COMPREPLY+=("@$match")
    done
    return 0
  fi

  return 1
}

_ccbridge() {
  local cur prev command
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  command="\${COMP_WORDS[1]}"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "run doctor presets completion setup answer resume continue" -- "$cur") )
    return 0
  fi

  case "$command" in
    run)
      case "$prev" in
        --preset)
          COMPREPLY=( $(compgen -W "${presetWords}" -- "$cur") )
          return 0
          ;;
        --config|--task-file)
          COMPREPLY=( $(compgen -f -- "$cur") )
          return 0
          ;;
        --workspace|--artifacts)
          COMPREPLY=( $(compgen -d -- "$cur") )
          return 0
          ;;
        --task)
          _ccbridge_task_value "$cur" && return 0
          ;;
      esac

      COMPREPLY=( $(compgen -W "--config --preset --task --task-file --workspace --artifacts --max-rounds --max-review-rounds --skip-preflight --json --verbose" -- "$cur") )
      return 0
      ;;
    answer|resume|continue)
      case "$prev" in
        --run|--answers-file)
          COMPREPLY=( $(compgen -f -- "$cur") )
          return 0
          ;;
      esac

      COMPREPLY=( $(compgen -W "--run --answers --answers-file --json --verbose" -- "$cur") )
      return 0
      ;;
    doctor)
      case "$prev" in
        --config)
          COMPREPLY=( $(compgen -f -- "$cur") )
          return 0
          ;;
        --preset)
          COMPREPLY=( $(compgen -W "${presetWords}" -- "$cur") )
          return 0
          ;;
      esac

      COMPREPLY=( $(compgen -W "--config --preset" -- "$cur") )
      return 0
      ;;
    completion|setup)
      COMPREPLY=( $(compgen -W "zsh bash" -- "$cur") )
      return 0
      ;;
  esac
}

complete -F _ccbridge ccbridge
`;
}
