" Vim syntax file for TT Time Tracker log files
" Language: TT Time Tracker Log
" Maintainer: TT Time Tracker
" Latest Revision: 2025-12-24

if exists("b:current_syntax")
  finish
endif

" Comments - full line comments starting with #
syntax match ttlogComment "^\s*#.*$"

" Timestamps - must be at start of non-comment line
" Full timestamp: YYYY-MM-DD HH:MM or YYYY-MM-DD HH:MM:SS
syntax match ttlogTimestampFull "^\s*\d\{4}-\d\{2}-\d\{2}\s\+\d\{1,2}:\d\{2}\(:\d\{2}\)\?"
" Time only: HH:MM or HH:MM:SS
syntax match ttlogTimestamp "^\s*\d\{1,2}:\d\{2}\(:\d\{2}\)\?"

" Resume markers - @prev or @N
syntax match ttlogResumeMarker "\s@prev\>"
syntax match ttlogResumeMarker "\s@\d\+\>"

" Projects - @projectName (alphanumeric, underscores, hyphens)
syntax match ttlogProject "\s@[a-zA-Z0-9_-]\+"

" Tags - +tagName (alphanumeric, underscores, hyphens)
syntax match ttlogTag "\s+[a-zA-Z0-9_-]\+"

" Estimates - ~duration (~2h, ~30m, ~1h30m)
syntax match ttlogEstimate "\s\~\d\+h\d*m\?"
syntax match ttlogEstimate "\s\~\d\+m"

" Priority - ^N (1-9)
syntax match ttlogPriority "\s\^[1-9]\>"

" Explicit Durations - (duration) ((2h), (30m), (1h30m))
syntax match ttlogDuration "(\d\+h\d*m\?)"
syntax match ttlogDuration "(\d\+m)"

" Remarks - # comment (with required space after #)
syntax match ttlogRemark "#\s.*$"

" Indentation marker - highlight leading spaces to show task interruptions
syntax match ttlogIndent "^\s\+" nextgroup=ttlogTimestamp,ttlogTimestampFull

" Define highlight groups and link to standard vim groups
highlight default link ttlogComment Comment
highlight default link ttlogTimestamp Number
highlight default link ttlogTimestampFull Number
highlight default link ttlogProject Identifier
highlight default link ttlogTag Type
highlight default link ttlogEstimate Special
highlight default link ttlogPriority PreProc
highlight default link ttlogDuration Constant
highlight default link ttlogRemark Comment
highlight default link ttlogResumeMarker Keyword
highlight default link ttlogIndent NonText

let b:current_syntax = "ttlog"
