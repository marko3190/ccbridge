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
local prev_word="$words[CURRENT-1]"
typeset -A opt_args

local -a _ccbridge_commands
_ccbridge_commands=(
  'version:Show the installed ccbridge version'
  'analyze:Run a collaborative analysis without editing files'
  'run:Start a new orchestration run'
  'doctor:Run preflight checks'
  'presets:List built-in presets'
  'ask:Add a follow-up question to a completed analysis run'
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
  if compset -P '@'; then
    _files
    return
  fi

  _message 'task text'
}

_ccbridge_file_value() {
  _files
}

_ccbridge_dir_value() {
  _files -/
}

_ccbridge_shell_value() {
  _values 'shell' zsh bash
}

case "$words[2]:$prev_word" in
  run:--preset|analyze:--preset|doctor:--preset)
    _describe -t presets 'ccbridge preset' _ccbridge_presets
    return
    ;;
  run:--task|analyze:--task)
    _ccbridge_task_value
    return
    ;;
  run:--config|run:--task-file|analyze:--config|analyze:--task-file|doctor:--config|answer:--answers-file|ask:--question-file)
    _ccbridge_file_value
    return
    ;;
  run:--workspace|run:--artifacts|run:--from-analysis|analyze:--workspace|analyze:--artifacts|answer:--run|ask:--run|resume:--run|continue:--run)
    _ccbridge_dir_value
    return
    ;;
    completion:completion|setup:setup)
    _ccbridge_shell_value
    return
    ;;
esac

case "$words[2]" in
  analyze)
    _arguments -C -s \\
      '(-h --help)'{-h,--help}'[show this help]' \\
      '--config[path to ccbridge config JSON]:config file:_files' \\
      '--preset[preset role layout]:preset:->preset' \\
      '--task[analysis task text or @file]:task:_ccbridge_task_value' \\
      '--task-file[read analysis task from a file]:task file:_files' \\
      '--workspace[override workspaceDir]:workspace:_files -/' \\
      '--artifacts[override artifactsDir]:artifacts path:_files -/' \\
      '--max-rounds[override max analysis rounds]:round count:' \\
      '--skip-preflight[skip auth and binary checks before run]' \\
      '--json[print machine-readable JSON]' \\
      '--verbose[include extra human summary detail]' && return
    case "$state" in
      preset)
        _describe -t presets 'ccbridge preset' _ccbridge_presets
        return
        ;;
    esac
    return
    ;;
  run)
    _arguments -C -s \\
      '(-h --help)'{-h,--help}'[show this help]' \\
      '--config[path to ccbridge config JSON]:config file:_files' \\
      '--preset[preset role layout]:preset:->preset' \\
      '--from-analysis[reuse a completed analysis run]:analysis run:_files -/' \\
      '--task[task text or @file]:task:_ccbridge_task_value' \\
      '--task-file[read task from a file]:task file:_files' \\
      '--workspace[override workspaceDir]:workspace:_files -/' \\
      '--artifacts[override artifactsDir]:artifacts path:_files -/' \\
      '--max-rounds[override max plan rounds]:round count:' \\
      '--max-review-rounds[override max review rounds]:review count:' \\
      '--skip-preflight[skip auth and binary checks before run]' \\
      '--json[print machine-readable JSON]' \\
      '--verbose[include extra human summary detail]' && return
    case "$state" in
      preset)
        _describe -t presets 'ccbridge preset' _ccbridge_presets
        return
        ;;
    esac
    return
    ;;
  ask)
    _arguments -s \\
      '(-h --help)'{-h,--help}'[show this help]' \\
      '--run[analysis run directory or run id]:run path:_files -/' \\
      '--question[follow-up analysis question]' \\
      '--question-file[file containing a follow-up question]:question file:_files' \\
      '--json[print machine-readable JSON]' \\
      '--verbose[include extra human summary detail]' && return
    ;;
  answer)
    _arguments -s \\
      '(-h --help)'{-h,--help}'[show this help]' \\
      '--run[run directory or run id]:run path:_files -/' \\
      '--answers[inline JSON answers map]' \\
      '--answers-file[file containing JSON answers]:answers file:_files' \\
      '--json[print machine-readable JSON]' \\
      '--verbose[include extra human summary detail]' && return
    ;;
  resume|continue)
    _arguments -s \\
      '(-h --help)'{-h,--help}'[show this help]' \\
      '--run[run directory or run id]:run path:_files -/' \\
      '--json[print machine-readable JSON]' \\
      '--verbose[include extra human summary detail]' && return
    ;;
  doctor)
    _arguments -C -s \\
      '(-h --help)'{-h,--help}'[show this help]' \\
      '--config[path to ccbridge config JSON]:config file:_files' \\
      '--preset[preset role layout]:preset:->preset' && return
    case "$state" in
      preset)
        _describe -t presets 'ccbridge preset' _ccbridge_presets
        return
        ;;
    esac
    return
    ;;
  version)
    _arguments -s '(-v --version)'{-v,--version}'[show the installed version]' '(-h --help)'{-h,--help}'[show this help]' && return
    ;;
  presets)
    _arguments -s '(-h --help)'{-h,--help}'[show this help]' && return
    ;;
  completion|setup)
    _arguments -s '(-h --help)'{-h,--help}'[show this help]' '1:shell:(zsh bash)' && return
    ;;
esac

_arguments -C '(-h --help)'{-h,--help}'[show this help]' '(-v --version)'{-v,--version}'[show the installed version]' '1:command:->command' '*::arg:->args'

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
    COMPREPLY=( $(compgen -W "version analyze run doctor presets completion setup ask answer resume continue -h --help -v --version" -- "$cur") )
    return 0
  fi

  case "$command" in
    analyze)
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

      COMPREPLY=( $(compgen -W "-h --help --config --preset --task --task-file --workspace --artifacts --max-rounds --skip-preflight --json --verbose" -- "$cur") )
      return 0
      ;;
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
        --workspace|--artifacts|--from-analysis)
          COMPREPLY=( $(compgen -d -- "$cur") )
          return 0
          ;;
        --task)
          _ccbridge_task_value "$cur" && return 0
          ;;
      esac

      COMPREPLY=( $(compgen -W "-h --help --config --preset --from-analysis --task --task-file --workspace --artifacts --max-rounds --max-review-rounds --skip-preflight --json --verbose" -- "$cur") )
      return 0
      ;;
    ask)
      case "$prev" in
        --run|--question-file)
          COMPREPLY=( $(compgen -f -- "$cur") )
          return 0
          ;;
      esac

      COMPREPLY=( $(compgen -W "-h --help --run --question --question-file --json --verbose" -- "$cur") )
      return 0
      ;;
    answer)
      case "$prev" in
        --run|--answers-file)
          COMPREPLY=( $(compgen -f -- "$cur") )
          return 0
          ;;
      esac

      COMPREPLY=( $(compgen -W "-h --help --run --answers --answers-file --json --verbose" -- "$cur") )
      return 0
      ;;
    resume|continue)
      case "$prev" in
        --run)
          COMPREPLY=( $(compgen -f -- "$cur") )
          return 0
          ;;
      esac

      COMPREPLY=( $(compgen -W "-h --help --run --json --verbose" -- "$cur") )
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

      COMPREPLY=( $(compgen -W "-h --help --config --preset" -- "$cur") )
      return 0
      ;;
    version)
      COMPREPLY=( $(compgen -W "-h --help -v --version" -- "$cur") )
      return 0
      ;;
    completion|setup)
      COMPREPLY=( $(compgen -W "-h --help zsh bash" -- "$cur") )
      return 0
      ;;
    presets)
      COMPREPLY=( $(compgen -W "-h --help" -- "$cur") )
      return 0
      ;;
  esac
}

complete -F _ccbridge ccbridge
`;
}
