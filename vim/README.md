# Vim Syntax Highlighting for TT Time Tracker

This directory contains vim syntax highlighting and filetype detection for `.ttlog` files.

## Features

- Syntax highlighting for all TT Time Tracker log elements:
  - **Timestamps**: Full dates and time-only formats
  - **Projects**: `@projectName`
  - **Tags**: `+tagName`
  - **Estimates**: `~2h`, `~30m`, `~1h30m`
  - **Explicit Durations**: `(1h30m)`, `(45m)`
  - **Remarks**: `# comment text`
  - **Resume Markers**: `@prev`, `@5`
  - **Comments**: Full-line comments starting with `#`
  - **Indentation**: Visual indication of task interruptions

- Filetype-specific settings:
  - Comment formatting support
  - Proper indentation with spaces (2 spaces)
  - Auto-comment continuation

## Installation

### Using a Plugin Manager

#### vim-plug

Add to your `.vimrc`:

```vim
Plug 'path/to/tt-time-tracker/vim'
```

#### Vundle

Add to your `.vimrc`:

```vim
Plugin 'file:///path/to/tt-time-tracker/vim'
```

#### Pathogen

```bash
ln -s /path/to/tt-time-tracker/vim ~/.vim/bundle/ttlog
```

### Manual Installation

Copy the directories to your vim runtime directory:

```bash
cp -r vim/ftdetect ~/.vim/
cp -r vim/syntax ~/.vim/
cp -r vim/ftplugin ~/.vim/
```

Or create symlinks:

```bash
ln -s /path/to/tt-time-tracker/vim/ftdetect/ttlog.vim ~/.vim/ftdetect/
ln -s /path/to/tt-time-tracker/vim/syntax/ttlog.vim ~/.vim/syntax/
ln -s /path/to/tt-time-tracker/vim/ftplugin/ttlog.vim ~/.vim/ftplugin/
```

#### Neovim

```bash
cp -r vim/ftdetect ~/.config/nvim/
cp -r vim/syntax ~/.config/nvim/
cp -r vim/ftplugin ~/.config/nvim/
```

## Usage

Once installed, vim will automatically:

- Detect `.ttlog` files and set the filetype to `ttlog`
- Apply syntax highlighting
- Configure appropriate editing settings

### Manual Activation

If needed, you can manually set the filetype:

```vim
:set filetype=ttlog
```

## Color Scheme

The syntax file uses standard vim highlight groups, so it will work with any color scheme:

- `Comment` - Comments and remarks
- `Number` - Timestamps
- `Identifier` - Projects
- `Type` - Tags
- `Special` - Estimates
- `Constant` - Explicit durations
- `Keyword` - Resume markers
- `NonText` - Indentation markers

## Example

Here's what a highlighted `.ttlog` file looks like:

```ttlog
# Monday, December 24, 2025
09:00 morning standup @myApp +meeting
09:15 implement auth @myApp +code ~4h # OAuth integration
  10:30 prod incident @legacy +urgent +ops (45m)
  11:30 lunch break +lunch (30m)
12:15 @prev # back to auth work
  14:00 pair program @myApp +code +pairing (1h30m)
16:00 write tests @myApp +testing ~1h
17:00 code review @myApp +review
```

## Customization

You can customize the colors by adding highlight commands to your `.vimrc`:

```vim
" Example: Make projects bold and blue
highlight ttlogProject ctermfg=blue cterm=bold guifg=#0000ff gui=bold

" Example: Make tags italic and green
highlight ttlogTag ctermfg=green cterm=italic guifg=#00ff00 gui=italic
```
