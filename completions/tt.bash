#!/usr/bin/env bash
# Bash completion for tt (time tracker)
# Installation: source this file in your ~/.bashrc or copy to /etc/bash_completion.d/

_tt_completion() {
    local cur prev words cword
    _init_completion || return

    # All available commands
    local commands="status log report list start stop interrupt resume pause abandon delete edit help"

    # Common flags
    local common_flags="-v --verbose --version --help"

    # Get the command being completed (first non-flag argument)
    local cmd=""
    local i
    for ((i=1; i < cword; i++)); do
        if [[ ${words[i]} != -* ]]; then
            cmd=${words[i]}
            break
        fi
    done

    # If no command yet, complete command names
    if [[ -z $cmd ]]; then
        COMPREPLY=($(compgen -W "$commands $common_flags" -- "$cur"))
        return
    fi

    # Command-specific completions
    case "$cmd" in
        log)
            case "$prev" in
                --overwrite)
                    return
                    ;;
                *)
                    # Complete file names and flags
                    COMPREPLY=($(compgen -W "--overwrite --help" -f -- "$cur"))
                    ;;
            esac
            ;;

        report)
            case "$prev" in
                --week)
                    COMPREPLY=($(compgen -W "current last" -- "$cur"))
                    # Also suggest ISO weeks
                    if [[ $cur == 20* ]]; then
                        local year=$(date +%Y)
                        local prev_year=$((year - 1))
                        COMPREPLY+=($(compgen -W "$(seq -f "${year}-W%02g" 1 53) $(seq -f "${prev_year}-W%02g" 1 53)" -- "$cur"))
                    fi
                    ;;
                --from|--to)
                    # Suggest fuzzy dates
                    COMPREPLY=($(compgen -W "yesterday today monday tuesday wednesday thursday friday saturday sunday" -- "$cur"))
                    ;;
                --project)
                    # Get recent projects from database
                    if command -v tt-completion-helper >/dev/null 2>&1; then
                        COMPREPLY=($(compgen -W "$(tt-completion-helper projects 2>/dev/null)" -- "$cur"))
                    fi
                    ;;
                --tag)
                    # Get recent tags from database
                    if command -v tt-completion-helper >/dev/null 2>&1; then
                        COMPREPLY=($(compgen -W "$(tt-completion-helper tags 2>/dev/null)" -- "$cur"))
                    fi
                    ;;
                --format)
                    COMPREPLY=($(compgen -W "terminal json csv" -- "$cur"))
                    ;;
                *)
                    COMPREPLY=($(compgen -W "--week --from --to --project --tag --format --help" -- "$cur"))
                    ;;
            esac
            ;;

        list)
            case "$prev" in
                --week)
                    COMPREPLY=($(compgen -W "current last" -- "$cur"))
                    ;;
                --from|--to)
                    COMPREPLY=($(compgen -W "yesterday today monday tuesday wednesday thursday friday saturday sunday" -- "$cur"))
                    ;;
                --project)
                    if command -v tt-completion-helper >/dev/null 2>&1; then
                        COMPREPLY=($(compgen -W "$(tt-completion-helper projects 2>/dev/null)" -- "$cur"))
                    fi
                    ;;
                --tag)
                    if command -v tt-completion-helper >/dev/null 2>&1; then
                        COMPREPLY=($(compgen -W "$(tt-completion-helper tags 2>/dev/null)" -- "$cur"))
                    fi
                    ;;
                --state)
                    COMPREPLY=($(compgen -W "working paused completed abandoned" -- "$cur"))
                    ;;
                --format)
                    COMPREPLY=($(compgen -W "table log" -- "$cur"))
                    ;;
                *)
                    COMPREPLY=($(compgen -W "--week --from --to --project --tag --state --format --help" -- "$cur"))
                    ;;
            esac
            ;;

        start|interrupt)
            case "$prev" in
                -p|--project)
                    if command -v tt-completion-helper >/dev/null 2>&1; then
                        COMPREPLY=($(compgen -W "$(tt-completion-helper projects 2>/dev/null)" -- "$cur"))
                    fi
                    ;;
                -t|--tags)
                    if command -v tt-completion-helper >/dev/null 2>&1; then
                        COMPREPLY=($(compgen -W "$(tt-completion-helper tags 2>/dev/null)" -- "$cur"))
                    fi
                    ;;
                -e|--estimate)
                    # Suggest common durations
                    COMPREPLY=($(compgen -W "15m 30m 1h 1h30m 2h 3h 4h" -- "$cur"))
                    ;;
                --at)
                    # Suggest relative times
                    COMPREPLY=($(compgen -W "-15m -30m -1h" -- "$cur"))
                    ;;
                *)
                    COMPREPLY=($(compgen -W "-p --project -t --tags -e --estimate --at --help" -- "$cur"))
                    ;;
            esac
            ;;

        stop|resume)
            case "$prev" in
                -r|--remark)
                    # No completion for free text
                    return
                    ;;
                --at)
                    COMPREPLY=($(compgen -W "-15m -30m -1h" -- "$cur"))
                    ;;
                *)
                    COMPREPLY=($(compgen -W "-r --remark --at --help" -- "$cur"))
                    ;;
            esac
            ;;

        pause|abandon)
            case "$prev" in
                --reason)
                    return
                    ;;
                --at)
                    COMPREPLY=($(compgen -W "-15m -30m -1h" -- "$cur"))
                    ;;
                *)
                    COMPREPLY=($(compgen -W "--reason --at --help" -- "$cur"))
                    ;;
            esac
            ;;

        delete)
            case "$prev" in
                --from|--to)
                    COMPREPLY=($(compgen -W "yesterday today monday tuesday wednesday thursday friday saturday sunday" -- "$cur"))
                    ;;
                -p|--project)
                    if command -v tt-completion-helper >/dev/null 2>&1; then
                        COMPREPLY=($(compgen -W "$(tt-completion-helper projects 2>/dev/null)" -- "$cur"))
                    fi
                    ;;
                -t|--tag)
                    if command -v tt-completion-helper >/dev/null 2>&1; then
                        COMPREPLY=($(compgen -W "$(tt-completion-helper tags 2>/dev/null)" -- "$cur"))
                    fi
                    ;;
                -s|--state)
                    COMPREPLY=($(compgen -W "working paused completed abandoned" -- "$cur"))
                    ;;
                *)
                    COMPREPLY=($(compgen -W "-y --yes --from --to -p --project -t --tag -s --state --dry-run --help" -- "$cur"))
                    ;;
            esac
            ;;

        edit)
            case "$prev" in
                -d|--description|-r|--remark)
                    return
                    ;;
                -p|--project)
                    if command -v tt-completion-helper >/dev/null 2>&1; then
                        COMPREPLY=($(compgen -W "$(tt-completion-helper projects 2>/dev/null)" -- "$cur"))
                    fi
                    ;;
                -t|--tags)
                    if command -v tt-completion-helper >/dev/null 2>&1; then
                        COMPREPLY=($(compgen -W "$(tt-completion-helper tags 2>/dev/null)" -- "$cur"))
                    fi
                    ;;
                -e|--estimate)
                    COMPREPLY=($(compgen -W "15m 30m 1h 1h30m 2h 3h 4h" -- "$cur"))
                    ;;
                --state)
                    COMPREPLY=($(compgen -W "working paused completed abandoned" -- "$cur"))
                    ;;
                --start-time|--end-time)
                    return
                    ;;
                *)
                    COMPREPLY=($(compgen -W "-d --description -p --project -t --tags -e --estimate -r --remark --start-time --end-time --state --help" -- "$cur"))
                    ;;
            esac
            ;;

        status|help)
            COMPREPLY=($(compgen -W "--help" -- "$cur"))
            ;;
    esac
}

# Register the completion function
complete -F _tt_completion tt
