# Development Guide

This document provides comprehensive information for developers working on TT Time Tracker.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Code Organization](#code-organization)
- [Testing Strategy](#testing-strategy)
- [Implementation Phases](#implementation-phases)
- [Recent Features](#recent-features-december-2024)
- [Code Style Guidelines](#code-style-guidelines)
- [Building and Distribution](#building-and-distribution)
- [Contributing](#contributing)
- [Performance Considerations](#performance-considerations)
- [Debugging](#debugging)
- [Future Enhancements](#future-enhancements)

## Development Setup

### Prerequisites

- Node.js >= 18
- npm or yarn
- SQLite3 (bundled with better-sqlite3)
- A Unix-like environment (Linux, macOS, WSL)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/kevjava/tt-time-tracker.git
cd tt-time-tracker

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run with test data
TT_DATA_DIR=/tmp/tt-test node dist/index.js log src/parser/__tests__/fixtures/simple.log
```

### Development Workflow

```bash
# Watch mode for tests
npm run test:watch

# Run specific test file
npm test -- duration.test.ts

# Check test coverage
npm run test:coverage

# Build and test
npm run build && npm test

# Test CLI commands
node dist/index.js --help
TT_DATA_DIR=/tmp/tt-test node dist/index.js log test.log
```

### Environment Variables

**Development:**

```bash
export TT_DATA_DIR=/tmp/tt-test    # Use temp directory for testing
export EDITOR=true                  # Non-interactive editor for tests
```

**Production:**

```bash
export TT_DATA_DIR=~/.local/share/tt
export EDITOR=vim
```

### Git Hooks

The project uses [Husky](https://typicode.github.io/husky/) to manage Git hooks and ensure code quality.

**Pre-commit Hook:**

- Automatically runs `npm test` before each commit
- Rejects commits if any tests fail
- Ensures the main branch always has passing tests

**Testing the hook:**

```bash
# Make a change and try to commit
git add .
git commit -m "Your commit message"

# If tests fail, the commit will be rejected
# Fix the tests and try again
```

**Bypassing the hook (not recommended):**

```bash
# Only use in emergencies
git commit --no-verify -m "Emergency fix"
```

**Hook location:**

- `.husky/pre-commit` - Pre-commit hook script
- The `prepare` script in `package.json` initializes Husky automatically on `npm install`

## Project Architecture

### High-Level Architecture

```
┌─────────────┐
│   CLI       │  Commander.js entry point
│  (index.ts) │
└──────┬──────┘
       │
       ├─────────────────┬─────────────────┬──────────────┐
       │                 │                 │              │
   ┌───▼───┐       ┌────▼────┐      ┌────▼────┐   ┌────▼────┐
   │  log  │       │ start   │      │  stop   │   │ report  │
   │command│       │ command │      │ command │   │ command │
   └───┬───┘       └────┬────┘      └────┬────┘   └────┬────┘
       │                │                │              │
   ┌───▼────────┐       │                │          ┌───▼────────┐
   │  Parser    │       │                │          │  Reports   │
   │            │       │                │          │            │
   │ ┌────────┐ │       │                │          │ ┌────────┐ │
   │ │duration│ │       │                │          │ │weekly  │ │
   │ │tokenizer│        │                │          │ │        │ │
   │ │grammar │ │       │                │          │ │calculators│
   │ └────────┘ │       │                │          │ │formatters│
   └───┬────────┘       │                │          │ └────────┘ │
       │                │                │          └───┬────────┘
       │                ▼                ▼              │
       │         ┌──────────────────────────┐          │
       └────────►│      Database Layer      │◄─────────┘
                 │                          │
                 │  ┌──────────────────┐    │
                 │  │ TimeTrackerDB    │    │
                 │  │ (better-sqlite3) │    │
                 │  └──────────────────┘    │
                 │                          │
                 │  ┌──────────────────┐    │
                 │  │   schema.sql     │    │
                 │  └──────────────────┘    │
                 └──────────────────────────┘
```

### Data Flow

#### Log Command Flow

```
Log File → Tokenizer → Grammar Parser → LogEntry[] → Database
                ↓
         Parse Errors → Editor → Retry
```

#### Report Command Flow

```
Database → Sessions → Report Generators → Formatters → Output
                         ↓
              ┌─────────────────────┐
              │ Context Switches    │
              │ Efficiency          │
              │ Focus Blocks        │
              │ Estimate Accuracy   │
              └─────────────────────┘
```

## Code Organization

### Directory Structure

```
tt-time-tracker/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── types/
│   │   ├── session.ts        # Core type definitions
│   │   └── errors.ts         # Error classes
│   ├── parser/               # Log file parsing
│   │   ├── duration.ts       # Duration string parsing
│   │   ├── tokenizer.ts      # Token extraction
│   │   ├── grammar.ts        # LogParser class
│   │   └── __tests__/        # Parser tests + fixtures
│   ├── db/                   # Database layer
│   │   ├── schema.sql        # SQLite schema
│   │   ├── database.ts       # TimeTrackerDB class
│   │   └── __tests__/        # Database tests
│   ├── reports/              # Reporting system
│   │   ├── types.ts          # Report type definitions
│   │   ├── weekly.ts         # Report generator
│   │   ├── calculators/      # Metric calculators
│   │   ├── formatters/       # Output formatters
│   │   └── __tests__/        # Report tests
│   ├── cli/                  # CLI commands
│   │   ├── commands/         # Command implementations
│   │   │   ├── log.ts
│   │   │   ├── start.ts
│   │   │   ├── stop.ts
│   │   │   ├── interrupt.ts
│   │   │   ├── resume.ts
│   │   │   ├── pause.ts
│   │   │   ├── abandon.ts
│   │   │   ├── report.ts
│   │   │   ├── list.ts
│   │   │   ├── delete.ts
│   │   │   ├── edit.ts
│   │   │   └── __tests__/    # Command tests
│   │   └── editor.ts         # Editor integration
│   └── utils/                # Utilities
│       ├── config.ts         # Configuration management
│       ├── date.ts           # Date utilities
│       ├── time-parser.ts    # --at flag time parsing
│       ├── session-validator.ts  # Session time validation
│       └── __tests__/        # Utility tests
├── dist/                     # Build output (generated)
├── package.json
├── tsconfig.json
├── jest.config.js
├── README.md
└── DEVELOPMENT.md
```

### Key Modules

#### Parser Module

**Duration Parser** (`src/parser/duration.ts`)

- Parses duration strings: `2h`, `30m`, `1h30m`
- Validates format and constraints
- Pure function, no side effects

**Tokenizer** (`src/parser/tokenizer.ts`)

- Converts log lines into token streams
- Handles: timestamps, projects, tags, estimates, durations, remarks
- Error-resilient: continues on errors, collects all errors

**Grammar Parser** (`src/parser/grammar.ts`)

- `LogParser` class converts tokens to `LogEntry` objects
- Maintains date context across entries
- Handles time underflow (midnight crossing)
- Resolves resume markers (`@prev`, `@N`)
- Generates warnings for time gaps

#### Database Module

**TimeTrackerDB** (`src/db/database.ts`)

- SQLite wrapper using better-sqlite3
- Manages sessions and tags
- CRUD operations with transactions
- Query filtering by time range, project, tags

**Schema** (`src/db/schema.sql`)

- `sessions` table: time entries with metadata
- `session_tags` table: many-to-many relationship
- Proper indexes for query performance
- Foreign key constraints with CASCADE

#### Reports Module

**Calculators** (`src/reports/calculators/`)

- `context-switches.ts`: Classify switches by severity
- `efficiency.ts`: Gross/net time calculations
- `focus-blocks.ts`: Deep work detection
- `estimate-accuracy.ts`: Estimate vs actual analysis

**Formatters** (`src/reports/formatters/`)

- `terminal.ts`: Colored, formatted terminal output
- `json.ts`: Structured JSON export
- `csv.ts`: Excel-compatible CSV

#### CLI Module

**Commands** (`src/cli/commands/`)

- Each command is a separate module
- Uses Commander.js for argument parsing
- Chalk for colored output
- Consistent error handling pattern

#### Utilities Module

**Time Parser** (`src/utils/time-parser.ts`)

- Parses time strings for `--at` flag
- Supports three formats: relative, time-only, full datetime
- Uses chrono-node for natural language parsing
- Validates times are not in the future
- Validates time ordering (end after start)

**Session Validator** (`src/utils/session-validator.ts`)

- Validation functions for each command type
- Checks overlap conflicts with existing sessions
- **Auto-adjusts small overlaps**: If overlap is < 60 seconds, automatically adjusts start time to 1 second after the previous session's end time
- Enforces time ordering constraints
- Provides clear error messages and adjustment warnings

**Functions:**

- `validateStartTime()` - For `start` command (with auto-adjustment)
- `validateStopTime()` - For `stop` command
- `validateInterruptTime()` - For `interrupt` command (with auto-adjustment)
- `validateResumeTime()` - For `resume` command
- `validatePauseTime()` - For `pause` command
- `validateAbandonTime()` - For `abandon` command

## Testing Strategy

### Test Organization

```
src/
  module/
    __tests__/
      module.test.ts
      fixtures/
        test-data.log
```

### Test Coverage

Current: **139 tests passing**

- **Parser Tests (74 tests)**
  - Duration: 17 tests
  - Tokenizer: 31 tests
  - Grammar: 26 tests

- **Database Tests (72 tests)**
  - CRUD operations
  - Filtering and queries
  - Foreign key constraints
  - Transaction behavior
  - Overlap detection (44 tests)

- **Utilities Tests (30 tests)**
  - Time parser: 26 tests (relative, time-only, full datetime)
  - Session validator: 30 tests (start, stop, interrupt, resume, pause, abandon)

- **Command Tests (28 tests)**
  - Start command: 5 tests
  - Interrupt command: 3 tests
  - Pause command: 11 tests
  - Abandon command: 13 tests
  - Edit command: multiple tests
  - Delete command: multiple tests

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Specific file
npm test -- duration.test.ts

# Coverage report
npm run test:coverage

# Pattern matching
npm test -- --testPathPattern=parser
```

### Writing Tests

**Unit Test Example:**

```typescript
describe("parseDuration", () => {
  it("should parse hours and minutes", () => {
    expect(parseDuration("1h30m")).toBe(90);
  });

  it("should reject invalid format", () => {
    expect(() => parseDuration("invalid")).toThrow(ParseError);
  });
});
```

**Integration Test Example:**

```typescript
describe("LogParser", () => {
  it("should parse complete log file", () => {
    const content = `09:00 task @project +tag`;
    const result = LogParser.parse(content, new Date("2024-12-24"));

    expect(result.errors).toHaveLength(0);
    expect(result.entries).toHaveLength(1);
  });
});
```

### Test Fixtures

Located in `src/parser/__tests__/fixtures/`:

- `simple.log` - Basic entries
- `interruptions.log` - Nested interruptions
- `errors.log` - Parse errors
- `warnings.log` - Time gaps
- `complex.log` - Real-world example

## Implementation Phases

The project was built in phases:

### Phase 1: Parser ✅

- Duration parser with validation
- Tokenizer with error recovery
- Grammar parser with date handling
- Resume marker resolution
- Comprehensive test coverage

### Phase 2: Database ✅

- SQLite schema design
- Database wrapper class
- CRUD operations
- Query filtering
- In-memory testing

### Phase 3: CLI - Log Command ✅

- Commander.js setup
- File and stdin input
- Editor integration for errors
- End time inference
- Parent-child relationships
- Summary display

### Phase 4: Reporting ✅

- Report calculators
- Terminal formatter
- JSON/CSV export
- Week filtering
- Project/tag filtering

### Phase 5: Session Management ✅

- List command with multiple formats
- Delete command with bulk operations
- Edit command with log notation support
- Status command for active sessions

### Phase 6: Retroactive Tracking ✅

- `--at` flag implementation for all time-based commands
- Time parsing: relative (`-30m`), time-only (`15:51`), full datetime
- Session overlap detection and prevention
- Validation layer for time constraints
- `pause` and `abandon` commands

## Recent Features (December 2025)

### Retroactive Tracking with `--at` Flag

All time-based commands now support the `--at` flag for retroactive tracking. This allows users to backfill forgotten context switches.

**Supported Commands:**

- `tt start --at <time>` - Start session at specific time
- `tt stop --at <time>` - Stop session at specific time
- `tt interrupt --at <time>` - Record interruption at specific time
- `tt resume --at <time>` - Resume from interruption at specific time
- `tt pause --at <time>` - Pause session at specific time
- `tt abandon --at <time>` - Abandon session at specific time

**Time Formats:**

- **Relative:** `-30m`, `-2h`, `-1h30m` (relative to current time)
- **Time-only:** `15:51` (today, or yesterday if that would be in future)
- **Full datetime:** `2025-12-29 15:51`

**Implementation Details:**

- `src/utils/time-parser.ts`: Parses and validates time strings using chrono-node
- `src/utils/session-validator.ts`: Validates times against business rules, auto-adjusts small overlaps
- `src/db/database.ts`: `getOverlappingSession()` returns full session details for conflict detection and auto-adjustment

**Validation Rules:**

- Times cannot be in the future
- Stop/pause/abandon time must be after session start
- New sessions cannot overlap with existing sessions
- Overlap detection excludes the session being modified
- **Auto-adjustment:** Small overlaps (< 60 seconds) are automatically resolved by adjusting start time to 1 second after the previous session's end

### Pause and Abandon Commands

Two new commands for managing session lifecycle:

**`tt pause`** - Pause active session without starting interruption

- Use case: Lunch breaks, end of day, stepping away
- Sets session state to `paused` and records end time
- Supports `--reason` flag for documentation
- Supports `--at` flag for retroactive pausing

**`tt abandon`** - Abandon active session

- Use case: Blocked tasks, deprioritized work, context switches
- Sets session state to `abandoned` and records end time
- Supports `--reason` flag for documentation
- Supports `--at` flag for retroactive abandonment

**Implementation:**

- `src/cli/commands/pause.ts`: Pause command implementation
- `src/cli/commands/abandon.ts`: Abandon command implementation
- Both follow same patterns as `stop` command
- Comprehensive test coverage (24 tests total)

## Code Style Guidelines

### TypeScript

- **Strict mode**: All strict TypeScript options enabled
- **No implicit any**: All types must be explicit
- **Interfaces over types**: Use interfaces for objects
- **Pure functions**: Prefer pure functions where possible
- **Error handling**: Use custom error classes

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Classes**: `PascalCase`
- **Functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE` for true constants
- **Types/Interfaces**: `PascalCase`

### Documentation

- **JSDoc comments**: Required for public APIs
- **Inline comments**: Explain complex logic
- **README**: Keep user documentation updated
- **Type definitions**: Use TypeScript types as documentation

### Example

```typescript
/**
 * Parse a duration string into minutes
 *
 * @param duration - Duration string (e.g., "2h30m")
 * @returns Duration in minutes
 * @throws ParseError if format is invalid
 */
export function parseDuration(duration: string): number {
  // Implementation
}
```

## Building and Distribution

### Build Process

```bash
npm run build
```

This:

1. Compiles TypeScript to JavaScript (`tsc`)
2. Copies schema.sql to dist directory
3. Generates source maps and type definitions

### Installation

```bash
# Global installation
npm install -g .

# Now available as:
tt log mywork.log
```

### Distribution

```json
{
  "bin": {
    "tt": "./dist/index.js"
  },
  "files": ["dist/", "README.md", "LICENSE"]
}
```

## Contributing

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Build successfully: `npm run build`
7. Commit with clear messages
8. Push and create a pull request

### Commit Messages

Format: `<type>: <description>`

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `test`: Tests
- `refactor`: Code refactoring
- `chore`: Build/tooling changes

Examples:

```
feat: add CSV export format
fix: handle midnight crossing in parser
docs: update README with examples
test: add integration tests for reports
```

### Pull Request Guidelines

- Include description of changes
- Reference related issues
- Ensure tests pass
- Update documentation if needed
- Keep changes focused and atomic

### Code Review Checklist

- [ ] Tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Code follows style guidelines
- [ ] New code has tests
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Error handling is comprehensive
- [ ] Types are explicit

## Performance Considerations

### Database

- **Indexes**: All time-range queries use indexes
- **Batch inserts**: Use transactions for multiple inserts
- **Connection pooling**: Single connection per command (CLI)

### Parser

- **Error recovery**: Continues parsing on errors
- **Streaming**: Processes file line-by-line
- **Memory**: No need to hold entire file in memory

### Reports

- **Lazy evaluation**: Calculate metrics on demand
- **Filtering**: Apply filters at database level
- **Caching**: No caching needed for CLI use case

## Debugging

### Enable Debug Logging

Add to commands:

```typescript
console.error("Debug:", JSON.stringify(data, null, 2));
```

### Test Database Inspection

```bash
# Use temp database
TT_DATA_DIR=/tmp/tt-test node dist/index.js log test.log

# Inspect with sqlite3
sqlite3 /tmp/tt-test/tt.db
> SELECT * FROM sessions;
> SELECT * FROM session_tags;
```

### Common Issues

**Build fails:**

- Check TypeScript errors: `npx tsc --noEmit`
- Ensure schema.sql is copied: `cp src/db/schema.sql dist/db/`

**Tests fail:**

- Clear node_modules: `rm -rf node_modules && npm install`
- Check for port conflicts (if running services)

**CLI doesn't work:**

- Rebuild: `npm run build`
- Check shebang: `#!/usr/bin/env node` in dist/index.js
- Permissions: `chmod +x dist/index.js`

## Future Enhancements

Potential improvements:

- [ ] Web dashboard for reports
- [ ] Export to other formats (PDF, Markdown)
- [ ] Pomodoro timer integration
- [ ] Team/multi-user support
- [ ] Cloud sync
- [ ] Mobile app
- [ ] Git integration (auto-tag commits)
- [ ] Calendar integration
- [ ] Smart suggestions based on patterns

## Resources

- [Commander.js Documentation](https://github.com/tj/commander.js)
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/wiki/API)
- [date-fns Documentation](https://date-fns.org/docs/)
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

## License

MIT - See LICENSE file for details.
