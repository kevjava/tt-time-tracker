#!/usr/bin/env bash
# Bash completion for tt (time tracker)
# Installation: source this file in your ~/.bashrc or copy to /etc/bash_completion.d/

_tt_completion() {
    local cur prev words cword
    _init_completion || return

    # All available commands (including aliases)
    local commands="status log report list ls start next switch stop interrupt resume pause abandon incomplete delete rm remove edit schedule config find search help"

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
                --overwrite|--dry-run)
                    return
                    ;;
                *)
                    # Complete file names and flags
                    COMPREPLY=($(compgen -W "--overwrite --dry-run --help" -f -- "$cur"))
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
                    COMPREPLY=($(compgen -W "--week --from --to --project --tag --format --compare --help" -- "$cur"))
                    ;;
            esac
            ;;

        list|ls)
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

        start|next|switch|interrupt)
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

        stop)
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

        resume)
            case "$prev" in
                -r|--remark)
                    # No completion for free text
                    return
                    ;;
                --at)
                    COMPREPLY=($(compgen -W "-15m -30m -1h" -- "$cur"))
                    ;;
                *)
                    COMPREPLY=($(compgen -W "-r --remark --at -y --yes --help" -- "$cur"))
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

        incomplete)
            case "$prev" in
                --from|--to)
                    COMPREPLY=($(compgen -W "yesterday today monday tuesday wednesday thursday friday saturday sunday" -- "$cur"))
                    ;;
                *)
                    COMPREPLY=($(compgen -W "--from --to --all --help" -- "$cur"))
                    ;;
            esac
            ;;

        delete|rm|remove)
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
                --start-time|--end-time|--continues)
                    return
                    ;;
                *)
                    COMPREPLY=($(compgen -W "-d --description -p --project -t --tags -e --estimate -r --remark --start-time --end-time --state --continues --help" -- "$cur"))
                    ;;
            esac
            ;;

        schedule)
            # Check if there's a subcommand
            local subcmd=""
            for ((i=2; i < cword; i++)); do
                if [[ ${words[i]} != -* ]]; then
                    subcmd=${words[i]}
                    break
                fi
            done

            if [[ -z $subcmd ]]; then
                # No subcommand yet, offer subcommands
                COMPREPLY=($(compgen -W "add list ls edit remove rm import --help" -- "$cur"))
            else
                case "$subcmd" in
                    add)
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
                                COMPREPLY=($(compgen -W "15m 30m 1h 1h30m 2h 3h 4h" -- "$cur"))
                                ;;
                            --priority)
                                COMPREPLY=($(compgen -W "1 2 3 4 5 6 7 8 9" -- "$cur"))
                                ;;
                            --start-time|--scheduled)
                                return
                                ;;
                            *)
                                COMPREPLY=($(compgen -W "-p --project -t --tags -e --estimate --priority --start-time --scheduled --help" -- "$cur"))
                                ;;
                        esac
                        ;;
                    edit)
                        case "$prev" in
                            --description)
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
                            --priority)
                                COMPREPLY=($(compgen -W "1 2 3 4 5 6 7 8 9" -- "$cur"))
                                ;;
                            --start-time|--scheduled)
                                return
                                ;;
                            *)
                                COMPREPLY=($(compgen -W "--description -p --project -t --tags -e --estimate --priority --start-time --scheduled --help" -- "$cur"))
                                ;;
                        esac
                        ;;
                    list|ls)
                        COMPREPLY=($(compgen -W "--help" -- "$cur"))
                        ;;
                    remove|rm)
                        COMPREPLY=($(compgen -W "-y --yes --help" -- "$cur"))
                        ;;
                    import)
                        # Complete file names and flags
                        COMPREPLY=($(compgen -W "--help" -f -- "$cur"))
                        ;;
                esac
            fi
            ;;

        config)
            # Check for subcommand
            local subcmd=""
            for ((i=2; i < cword; i++)); do
                if [[ ${words[i]} != -* ]]; then
                    subcmd=${words[i]}
                    break
                fi
            done

            if [[ -z $subcmd ]]; then
                COMPREPLY=($(compgen -W "get set edit path --help" -- "$cur"))
            else
                case "$subcmd" in
                    get|set)
                        COMPREPLY=($(compgen -W "weekStartDay reportFormat listFormat timeFormat editor" -- "$cur"))
                        ;;
                    edit|path)
                        COMPREPLY=($(compgen -W "--help" -- "$cur"))
                        ;;
                esac
            fi
            ;;

        find|search)
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
                    COMPREPLY=($(compgen -W "--from --to -p --project -t --tag -s --state --help" -- "$cur"))
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
