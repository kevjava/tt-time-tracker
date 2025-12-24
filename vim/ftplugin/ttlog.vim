" Vim filetype plugin for TT Time Tracker log files
" Language: TT Time Tracker Log
" Maintainer: TT Time Tracker
" Latest Revision: 2025-12-24

if exists("b:did_ftplugin")
  finish
endif
let b:did_ftplugin = 1

let s:save_cpo = &cpo
set cpo&vim

" Comment string for line commenting
setlocal commentstring=#\ %s
setlocal comments=:#

" Format options
setlocal formatoptions-=t  " Don't auto-wrap text
setlocal formatoptions+=c  " Auto-wrap comments
setlocal formatoptions+=r  " Continue comments on <Enter>
setlocal formatoptions+=q  " Allow formatting comments with gq

" Indentation - use spaces for task interruptions
setlocal expandtab
setlocal shiftwidth=2
setlocal softtabstop=2

" Undo ftplugin
let b:undo_ftplugin = "setlocal commentstring< comments< formatoptions< expandtab< shiftwidth< softtabstop<"

let &cpo = s:save_cpo
unlet s:save_cpo
