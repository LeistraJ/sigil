# Sigil

Local-first project memory and governance engine for AI-assisted software development.

Sigil gives every AI coding agent (Claude Code, Cursor, Windsurf, Gemini CLI, GitHub Copilot) and every human developer the same context: architecture rules, constraints, anti-patterns, decisions, tasks, and technical debt — automatically, from a local SQLite database.

**Sigil owns memory + governance. Agents own execution. You own control.**

---

## Installation

```bash
npm install -g @leistraj/sigil
```

> Requires Node.js >=18 and a C++ compiler (for the native SQLite module).

### Other install methods

```bash
npx @leistraj/sigil init          # run once without installing
npm install -g github:LeistraJ/sigil  # direct from GitHub
```

---

## Two Modes

**Lite mode** — Works in any git repo immediately after install. No per-project setup. Tracks session state globally (`~/.sigil/sessions/`). Gets you `sigil resume` for free.

**Full mode** — Run `sigil init` once per project. Unlocks the full database: tasks, specs, decisions, debt, governance scoring, and auto-regenerated agent context files.

---

## Quick Start

### One-time global setup (do this once)

```bash
sigil setup
```

Installs three hooks that run automatically in every git project from now on:
- `~/.git-hooks/post-commit` — saves session after every commit (works with any agent)
- `~/.claude/settings.json` Stop hook — saves when Claude Code finishes responding
- `~/.zshrc` EXIT trap — saves when your terminal closes

After this, session state saves itself. You never have to think about it.

### Start a project (full mode)

```bash
cd my-project
sigil init           # interactive setup: name, type, description, structure detection
```

Creates `.sigil/sigil.db`, `.sigil/config.json`, and generates `CLAUDE.md` + `AGENTS.md` pre-loaded with architecture rules appropriate for your project type.

### Daily flow

```bash
# Morning — agent reads CLAUDE.md/AGENTS.md automatically, session context already there

# During work
sigil task update abc123 --status in_progress

# After a chunk of work
sigil ingest          # scan changes, update DB, regenerate context files
sigil check           # optional — governance audit with health score

# Made an important decision
sigil decision add

# End of day — leave a note for next session
sigil session save --note "finished the API layer, need to wire up the UI next"
# (or just close the terminal — EXIT trap handles it automatically)
```

---

## Pick Up Where You Left Off

The session system saves your context automatically and injects it into all your agent config files so the next session starts with full context — no manual copy-paste.

### How it works

When a session save fires (automatically after every commit, every Claude response, and when your terminal closes), Sigil:
1. Captures: current branch, in-progress tasks, recent commits, uncommitted files
2. Writes to: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `GEMINI.md`, `.windsurfrules`, `.github/copilot-instructions.md` — whatever exists in your project

The next time any agent opens your project and reads its config file, the session block is already there.

### Manual commands

```bash
# Leave a note before closing (most useful thing you can do)
sigil session save --note "halfway through auth refactor, token refresh not wired up"

# Print the briefing to terminal (or to pipe to an agent)
sigil resume
```

`sigil resume` works in lite mode (no `sigil init`) — it reads from git state alone.

---

## The Core Loop (Full Mode)

```
sigil init (one-time per project)
    → creates .sigil/, seeds DB with rules, generates agent context files

AI agent session (reads CLAUDE.md / AGENTS.md automatically)
    → follows architecture rules, constraints, anti-patterns
    → works on tasks linked to feature specs

sigil ingest (after session, or auto via git hook)
    → diffs files, detects debt, records what happened
    → regenerates all agent context files

sigil check (optional)
    → governance audit, health score 0–100
    → flags violations, warnings, coverage gaps

(repeat — each session starts with full context from the previous one)
```

---

## Commands

### Setup & Session

| Command | Description |
|---------|-------------|
| `sigil setup [--dry-run]` | One-time install of global hooks for all projects |
| `sigil session save [--note "..."] [--quiet]` | Save session snapshot manually |
| `sigil resume` | Print session briefing (works without sigil init) |

### Core

| Command | Description |
|---------|-------------|
| `sigil init` | Initialize Sigil in the current project |
| `sigil ingest [--agent=<name>] [--quiet]` | Scan changes and update context |
| `sigil status` | Project health dashboard |
| `sigil check [--format=json\|markdown] [--quiet]` | Governance audit with health score |

### Governance

| Command | Description |
|---------|-------------|
| `sigil rule list\|add\|disable\|enable\|show` | Architecture rules |
| `sigil constraint list\|add\|show` | Project constraints |
| `sigil antipattern list\|add\|show` | Anti-patterns |
| `sigil pattern list\|add\|show` | Code patterns agents should follow |

### Project Knowledge

| Command | Description |
|---------|-------------|
| `sigil spec create\|list\|show\|update` | Feature specs (goal, scope, acceptance criteria) |
| `sigil task add\|list\|update\|show` | Tasks (linked to specs, assigned to agents) |
| `sigil decision add\|list\|show` | Architectural decisions (permanent record) |
| `sigil debt add\|list\|update\|show` | Technical debt tracking |

### Output & Export

| Command | Description |
|---------|-------------|
| `sigil query <question>` | Ad-hoc questions about project data |
| `sigil export context [--profile=builder\|reviewer\|planner\|debugger]` | Export context file |
| `sigil handoff [--mode=agent\|human\|sprint]` | Generate handoff document |
| `sigil report governance [--since=7d] [--format=json\|markdown]` | Governance trend report |

---

## What Gets Injected into Agent Files

After `sigil init` + `sigil ingest`, your `CLAUDE.md` has two auto-managed sections:

**Session block** (`<!-- SIGIL_SESSION:START -->`) — updated on every session save:
- When you last saved and from which branch
- Your "where you left off" note
- What tasks were in progress
- Uncommitted files and recent commits

**Context block** (`<!-- SIGIL:START -->`) — updated on every `sigil ingest`:
- Project name, type, description
- Active feature spec and its goal
- Open tasks ordered by priority
- Architecture rules (violations only — the hard constraints)
- Project constraints
- Recent decisions to honor
- Open critical/high technical debt

Any content you write **outside** these markers is preserved. Sigil only manages its own blocks.

---

## Supported Agent Files

Sigil detects and injects session context into whichever of these exist in your project:

| File | Agent |
|------|-------|
| `CLAUDE.md` | Claude Code |
| `AGENTS.md` | Gemini CLI, general |
| `GEMINI.md` | Gemini CLI |
| `.cursorrules` | Cursor |
| `cursor.md` | Cursor |
| `.windsurfrules` | Windsurf |
| `.github/copilot-instructions.md` | GitHub Copilot |

---

## Project Types & Seeded Rules

On `sigil init`, choose a project type and get appropriate rules seeded automatically:

| Type | Seeded rules |
|------|-------------|
| `general` | 15 universal architecture rules, 10 constraints, 8 anti-patterns |
| `frontend` | Universal + 6 frontend rules (component responsibility, no direct DOM, API service layer, etc.) |
| `backend` | Universal + 7 backend rules (thin handlers, repository pattern, no silent errors, etc.) |
| `fullstack` | Frontend + backend + 3 cross-boundary rules (shared types, API contract alignment, etc.) |
| `library` | Universal + 6 library rules (semver, tree-shakeable exports, backward compatibility, etc.) |

---

## Health Score

`sigil check` produces a score 0–100:

- Start at **100**
- **−8** per violation (architecture rule breach, critical aging debt, oversized files)
- **−3** per warning
- **−1** per info issue

Score ratings: 90+ excellent · 75–89 good · 60–74 needs attention · 40–59 concerning · below 40 critical

---

## Technical Debt Categories

| Category | Description |
|----------|-------------|
| `duplication` | Repeated logic across modules |
| `boundary_violation` | Layers bleeding into each other |
| `missing_tests` | Code without coverage |
| `temporary_hack` | Shortcuts needing proper fixes |
| `oversized_file` | Files over the line threshold |
| `unclear_abstraction` | Confusing module boundaries |
| `inconsistent_naming` | Same concept named differently |
| `performance_compromise` | Known slow paths |
| `missing_error_handling` | Silent failures |
| `stale_dependency` | Outdated or risky dependencies |

---

## Context Profiles

When exporting context manually, choose a profile:

| Profile | Optimized for |
|---------|--------------|
| `builder` (default) | Active development — tasks, rules, patterns, recent work |
| `reviewer` | Code review — decisions, anti-patterns, debt |
| `planner` | Sprint planning — specs, tasks, constraints |
| `debugger` | Debugging — recent artifacts, rules, debt, decisions |

---

## Generated Files

```
CLAUDE.md                          ← auto-loaded by Claude Code
AGENTS.md                          ← auto-loaded by Gemini CLI
.sigil/
├── sigil.db                       ← SQLite database (all state)
├── config.json                    ← project configuration
└── exports/
    └── context-latest.md          ← full context export (no token limit)
~/.sigil/
└── sessions/<repo-hash>/
    └── session.json               ← lite session state (no sigil init required)
```

### Should you commit `sigil.db`?

| Scenario | Recommendation |
|----------|---------------|
| Solo developer | **Commit it.** Rules, tasks, decisions, and debt persist across machines. |
| Team with shared governance | **Commit it.** Everyone shares the same rules and decisions. |
| Team where each dev has their own context | Add `.sigil/sigil.db` to `.gitignore`. Use `sigil export context` to share context files manually. |

---

## Configuration

`.sigil/config.json`:

```json
{
  "project": { "name": "my-project", "type": "fullstack", "description": "..." },
  "thresholds": {
    "max_file_lines": 300,
    "max_function_lines": 80,
    "debt_aging_critical_days": 7,
    "debt_aging_high_days": 30,
    "debt_aging_stale_days": 90
  },
  "structure": {
    "feature_dirs": ["src/features/*"],
    "service_dirs": ["src/services/*"],
    "shared_dirs": ["src/shared/*"],
    "test_dirs": ["src/**/__tests__/*"]
  },
  "max_context_tokens": 8000,
  "agent_files": ["CLAUDE.md", "AGENTS.md"]
}
```

---

## License

MIT
