# Sigil

Local-first project memory and governance engine for AI-assisted software development.

Sigil gives every AI coding CLI (Claude Code, Gemini CLI, Codex, local models) and every human developer the same context: architecture rules, constraints, anti-patterns, patterns, decisions, tasks, and technical debt — automatically, from a local SQLite database.

**Sigil owns memory + governance. CLIs own execution. Users own control.**

---

## Installation

### npm (recommended)
```bash
npm install -g @leistraj/sigil
```

### npx (no install — run once)
```bash
npx @leistraj/sigil init
```

### Homebrew
```bash
brew tap LeistraJ/sigil
brew install sigil-cli
```

### Direct from GitHub
```bash
npm install -g github:LeistraJ/sigil
```
> Requires Node.js >=18 and a C++ compiler (for the SQLite native module).

### From source
```bash
git clone https://github.com/LeistraJ/sigil.git
cd sigil
npm install && npm run build
npm link
```

---

## Quick Start

```bash
# 1. Initialize in your project root
cd my-project
sigil init

# 2. Code with your AI agent (reads CLAUDE.md / AGENTS.md automatically)

# 3. After a session, ingest changes
sigil ingest

# 4. Check governance health
sigil check

# 5. See project overview
sigil status
```

---

## The Lifecycle

```
sigil init (one-time)
    → creates .sigil/, seeds DB, generates CLAUDE.md + AGENTS.md

AI agent session (Claude, Gemini, Codex, etc.)
    → agent reads CLAUDE.md / AGENTS.md automatically
    → agent writes code following governance rules

sigil ingest (after session, or auto via git hook)
    → diffs files, scans for debt, records what happened
    → regenerates all agent context files

Next AI agent session
    → reads updated context with full memory of what previous agents did
    → follows same architecture rules

(repeat)
```

---

## Commands

### Core

| Command | Description |
|---------|-------------|
| `sigil init` | Initialize Sigil in the current project |
| `sigil ingest [--agent=<name>] [--quiet]` | Scan changes and update context |
| `sigil status` | Project health overview |
| `sigil check [--format=json\|markdown]` | Governance audit with health score |

### Governance CRUD

| Command | Description |
|---------|-------------|
| `sigil rule list\|add\|disable\|enable\|show` | Manage architecture rules |
| `sigil constraint list\|add\|show` | Manage project constraints |
| `sigil antipattern list\|add\|show` | Manage anti-patterns |
| `sigil pattern list\|add\|show` | Manage code patterns |

### Project CRUD

| Command | Description |
|---------|-------------|
| `sigil spec create\|list\|show\|update` | Manage feature specs |
| `sigil task add\|list\|update\|show` | Manage tasks |
| `sigil decision add\|list\|show` | Record architectural decisions |
| `sigil debt add\|list\|update\|show` | Track technical debt |

### Output & Export

| Command | Description |
|---------|-------------|
| `sigil query <table> [--status=] [--severity=] [--limit=] [--format=json]` | Query any table |
| `sigil export context [--profile=builder\|reviewer\|planner\|debugger]` | Export context file |
| `sigil handoff [--mode=agent\|human\|sprint]` | Generate handoff document |
| `sigil report governance [--since=7d] [--format=json\|markdown]` | Governance report |

---

## Context Profiles

When exporting context or running `sigil export context`, choose a profile optimized for your use case:

| Profile | Best for |
|---------|----------|
| `builder` (default) | Active development — tasks, rules, patterns, recent work |
| `reviewer` | Code review — decisions, anti-patterns, debt |
| `planner` | Sprint planning — specs, tasks, constraints |
| `debugger` | Debugging — recent artifacts, rules, debt, decisions |

---

## Project Types & Seeded Rules

On `sigil init`, you choose a project type. Sigil seeds appropriate rules:

- **general**: 15 universal architecture rules + 10 constraints + 8 anti-patterns
- **frontend**: universal + 6 frontend rules (component responsibility, no DOM manipulation, API service layer, etc.)
- **backend**: universal + 7 backend rules (thin handlers, repository pattern, no silent errors, etc.)
- **fullstack**: frontend + backend + 3 cross-boundary rules (shared types, API contract alignment, etc.)
- **library**: universal + 6 library rules (semver, tree-shakeable exports, backward compatibility, etc.)

---

## Generated Files

After `sigil init` or `sigil ingest`, Sigil writes:

```
CLAUDE.md                           ← Auto-loaded by Claude Code
AGENTS.md                           ← Auto-loaded by Gemini CLI
.sigil/
├── sigil.db                        ← SQLite database (all state)
├── config.json                     ← Project configuration
└── exports/
    └── context-latest.md           ← Full context (no token limit)
```

**Important**: Sigil uses `<!-- SIGIL:START -->` / `<!-- SIGIL:END -->` markers in CLAUDE.md/AGENTS.md to preserve any content you've added manually outside those markers.

### Should you commit `sigil.db`?

`sigil.db` is **not** gitignored by default. The right choice depends on your workflow:

| Scenario | Recommendation |
|----------|---------------|
| Solo developer | **Commit it.** Your rules, tasks, decisions, and debt persist across machines. |
| Team with shared governance | **Commit it.** Everyone shares the same rules and decisions. |
| Team where each dev has their own context | Add `.sigil/sigil.db` to `.gitignore`. Use `sigil export context` to share context files manually. |

---

## Configuration

`.sigil/config.json` controls Sigil's behavior:

```json
{
  "project": { "name": "my-project", "type": "fullstack" },
  "thresholds": {
    "max_file_lines": 300,
    "debt_aging_critical_days": 7,
    "debt_aging_high_days": 30,
    "debt_aging_stale_days": 90
  },
  "structure": {
    "feature_dirs": ["src/features/*"],
    "service_dirs": ["src/services/*"],
    ...
  },
  "max_context_tokens": 8000,
  "agent_files": ["CLAUDE.md", "AGENTS.md"]
}
```

---

## Git Hook

During `sigil init`, you can install a post-commit hook for automatic ingestion:

```bash
# .git/hooks/post-commit
#!/bin/sh
# Sigil auto-ingest — skipped silently if sigil is not installed
command -v sigil >/dev/null 2>&1 && sigil ingest --quiet --agent=git-hook
```

This runs `sigil ingest` after every commit, keeping your context files always current. The `command -v` guard means teammates without Sigil installed won't get hook errors.

---

## Technical Debt Categories

When running `sigil debt add`, choose a category:

- `duplication` — Repeated logic across modules
- `boundary_violation` — Layers bleeding into each other
- `missing_tests` — Code without test coverage
- `temporary_hack` — Shortcuts that need proper fixes
- `oversized_file` — Files over the line threshold
- `unclear_abstraction` — Confusing module boundaries
- `inconsistent_naming` — Same concept named differently
- `performance_compromise` — Known slow paths
- `missing_error_handling` — Silent failures
- `stale_dependency` — Outdated or risky dependencies

---

## Health Score

`sigil check` calculates a governance score (0-100):

- Start at **100**
- **-8** per violation
- **-3** per warning  
- **-1** per info issue

Violations include: oversized files, aged critical debt, missing rationale on decisions, specs without acceptance criteria.

---

## License

MIT
