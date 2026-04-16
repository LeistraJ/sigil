import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { initDb, DB } from '../db/connection';
import { SigilInitState, formatDate, parseJSON, truncate, nowIso } from '../utils/format';
import { getCurrentBranch, getShortRef, getRecentCommits, getDirtyFiles, getGitRoot } from '../utils/git';
import { injectSessionBlock } from '../engine/regenerate';
import { TaskRow, FeatureSpecRow, ArtifactRow, SigilConfig } from '../types';

// ─── Agent file candidates (checked in any project) ──────────────────────────

const AGENT_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  'cursor.md',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
];

// ─── Global session store ─────────────────────────────────────────────────────

interface LiteSession {
  savedAt: string;
  note: string;
  branch: string;
  ref: string;
  inProgress: string[];
}

function globalSessionDir(gitRoot: string): string {
  const hash = crypto.createHash('sha1').update(gitRoot).digest('hex').slice(0, 12);
  return path.join(os.homedir(), '.sigil', 'sessions', hash);
}

function readLiteSession(gitRoot: string): LiteSession | null {
  const file = path.join(globalSessionDir(gitRoot), 'session.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as LiteSession;
  } catch {
    return null;
  }
}

function writeLiteSession(gitRoot: string, session: LiteSession): void {
  const dir = globalSessionDir(gitRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');
}

// ─── Detect sigil init ────────────────────────────────────────────────────────

function trySigilInit(cwd: string): SigilInitState | null {
  const sigilDir = path.join(cwd, '.sigil');
  const configPath = path.join(sigilDir, 'config.json');
  const dbPath = path.join(sigilDir, 'sigil.db');
  if (!fs.existsSync(sigilDir) || !fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SigilConfig;
    return { config, dbPath, sigilDir, configPath };
  } catch {
    return null;
  }
}

// ─── Detect which agent files exist in a project ─────────────────────────────

function detectAgentFiles(projectRoot: string): string[] {
  return AGENT_FILES.filter(f => fs.existsSync(path.join(projectRoot, f)));
}

// ─── Session block builder ────────────────────────────────────────────────────

function buildSessionBlock(opts: {
  projectName: string;
  savedAt: string;
  note: string;
  savedBranch: string;
  savedRef: string;
  savedInProgress: string[];
  currentBranch: string | null;
  currentRef: string | null;
  dirtyFiles: string[];
  recentCommits: string[];
  activeTasks?: TaskRow[];
  activeSpec?: FeatureSpecRow;
  lastArtifact?: ArtifactRow;
  governanceScore?: string;
  openDebtCount?: number;
}): string {
  const {
    projectName, savedAt, note, savedBranch, savedRef, savedInProgress,
    currentBranch, currentRef, dirtyFiles, recentCommits,
    activeTasks, activeSpec, lastArtifact, governanceScore, openDebtCount,
  } = opts;

  const lines: string[] = [`## Current Session — ${projectName}`, ''];

  if (savedAt) {
    const branchInfo = savedBranch ? `  Branch: ${savedBranch} @ ${savedRef}` : '';
    lines.push(`Last saved: ${formatDate(savedAt)}${branchInfo}`);
  } else {
    lines.push('No session saved yet — showing current state.');
  }
  if (currentBranch) {
    const changed = savedBranch && currentBranch !== savedBranch;
    lines.push(`Current:    Branch: ${currentBranch} @ ${currentRef}${changed ? '  (branch changed since last save)' : ''}`);
  }
  lines.push('');

  if (note) {
    lines.push('### Where you left off');
    lines.push(note);
    lines.push('');
  }

  if (savedInProgress.length > 0) {
    lines.push('### In progress when saved');
    savedInProgress.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    lines.push('');
  }

  if (activeTasks) {
    const inProgress = activeTasks.filter(t => t.status === 'in_progress');
    const blocked = activeTasks.filter(t => t.status === 'blocked');
    const todo = activeTasks.filter(t => t.status === 'todo').slice(0, 5);

    if (inProgress.length > 0) {
      lines.push('### Currently in progress');
      inProgress.forEach((t, i) => {
        const desc = t.description ? ` — ${truncate(t.description, 80)}` : '';
        lines.push(`${i + 1}. [${t.priority}] ${t.title}${desc}`);
      });
      lines.push('');
    }
    if (blocked.length > 0) {
      lines.push('### Blocked');
      blocked.forEach(t => lines.push(`- ${t.title}${t.description ? ` — ${t.description}` : ''}`));
      lines.push('');
    }
    if (todo.length > 0) {
      lines.push('### Next up (by priority)');
      todo.forEach((t, i) => {
        const desc = t.description ? ` — ${truncate(t.description, 70)}` : '';
        lines.push(`${i + 1}. [${t.priority}] ${t.title}${desc}`);
      });
      lines.push('');
    }
  }

  if (lastArtifact) {
    const touched = parseJSON<string[]>(lastArtifact.files_touched, []);
    const added = parseJSON<string[]>(lastArtifact.files_added, []);
    const all = [...new Set([...touched, ...added])].slice(0, 10);
    if (all.length > 0) {
      lines.push('### Last ingest — files touched');
      all.forEach(f => lines.push(`- ${f}`));
      if (lastArtifact.summary) lines.push(`\n*${lastArtifact.summary}*`);
      lines.push('');
    }
  }

  if (dirtyFiles.length > 0) {
    lines.push('### Uncommitted changes');
    dirtyFiles.slice(0, 10).forEach(f => lines.push(`- ${f}`));
    if (dirtyFiles.length > 10) lines.push(`- … and ${dirtyFiles.length - 10} more`);
    lines.push('');
  }

  if (recentCommits.length > 0) {
    lines.push('### Recent commits');
    recentCommits.forEach(c => lines.push(`- ${c}`));
    lines.push('');
  }

  const ctx: string[] = [];
  if (activeSpec) ctx.push(`Active spec: ${activeSpec.title}`);
  if (governanceScore) ctx.push(`Governance score: ${governanceScore}/100`);
  if (openDebtCount && openDebtCount > 0) ctx.push(`Open critical/high debt: ${openDebtCount}`);
  if (ctx.length > 0) {
    lines.push('### Project context');
    ctx.forEach(p => lines.push(`- ${p}`));
  }

  return lines.join('\n');
}

// ─── Inject into all detected agent files ────────────────────────────────────

function injectIntoAgentFiles(projectRoot: string, agentFiles: string[], content: string): void {
  if (agentFiles.length === 0) return;
  injectSessionBlock(projectRoot, agentFiles, content);
}

// ─── Core save logic (works with or without sigil init) ──────────────────────

function doSessionSave(opts: { note?: string; quiet?: boolean; cwd?: string }): void {
  const cwd = opts.cwd ?? process.cwd();
  const gitRoot = getGitRoot(cwd);

  if (!gitRoot) {
    if (!opts.quiet) console.error('Not inside a git repository.');
    return;
  }

  const now = nowIso();
  const branch = getCurrentBranch(cwd) ?? '';
  const ref = getShortRef(cwd) ?? '';
  const dirtyFiles = getDirtyFiles(cwd);
  const recentCommits = getRecentCommits(3, cwd);
  const sigilState = trySigilInit(gitRoot);

  let projectName = path.basename(gitRoot);
  let activeTasks: TaskRow[] | undefined;
  let activeSpec: FeatureSpecRow | undefined;
  let lastArtifact: ArtifactRow | undefined;
  let governanceScore: string | undefined;
  let openDebtCount: number | undefined;
  let inProgressTitles: string[] = [];
  let savedNote = opts.note ?? '';

  if (sigilState) {
    const db = initDb(sigilState.dbPath);
    projectName = sigilState.config.project.name;

    const getMeta = (key: string) =>
      (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? '';

    const prevNote = getMeta('session_note');
    if (!savedNote && prevNote) savedNote = prevNote;

    inProgressTitles = (db.prepare(
      "SELECT title FROM tasks WHERE status = 'in_progress' ORDER BY updated_at DESC"
    ).all() as Array<{ title: string }>).map(t => t.title);

    activeTasks = db.prepare(`
      SELECT * FROM tasks WHERE status != 'done'
      ORDER BY CASE status WHEN 'in_progress' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,
      CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      updated_at DESC LIMIT 10
    `).all() as TaskRow[];

    activeSpec = db.prepare(
      "SELECT * FROM feature_specs WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1"
    ).get() as FeatureSpecRow | undefined;

    lastArtifact = db.prepare(
      "SELECT * FROM artifacts ORDER BY created_at DESC LIMIT 1"
    ).get() as ArtifactRow | undefined;

    governanceScore = getMeta('last_check_score') || undefined;
    openDebtCount = (db.prepare(
      "SELECT COUNT(*) as n FROM technical_debt WHERE status != 'resolved' AND severity IN ('critical','high')"
    ).get() as { n: number }).n;

    const upsert = db.prepare("INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES (?, ?, ?)");
    upsert.run('session_saved_at', now, now);
    upsert.run('session_note', opts.note ?? prevNote, now);
    upsert.run('session_branch', branch, now);
    upsert.run('session_ref', ref, now);
    upsert.run('session_in_progress', JSON.stringify(inProgressTitles), now);
  }

  // Always persist to global lite store so resume works without sigil init too
  const prevLite = readLiteSession(gitRoot);
  writeLiteSession(gitRoot, {
    savedAt: now,
    note: opts.note ?? prevLite?.note ?? '',
    branch,
    ref,
    inProgress: inProgressTitles,
  });

  const sessionContent = buildSessionBlock({
    projectName,
    savedAt: now,
    note: savedNote,
    savedBranch: branch,
    savedRef: ref,
    savedInProgress: inProgressTitles,
    currentBranch: branch,
    currentRef: ref,
    dirtyFiles,
    recentCommits,
    activeTasks,
    activeSpec,
    lastArtifact,
    governanceScore,
    openDebtCount,
  });

  // Inject into sigil-configured agent files first
  if (sigilState) {
    injectIntoAgentFiles(gitRoot, sigilState.config.agent_files, sessionContent);
  }
  // Also inject into any other detected agent files not already covered
  const covered = new Set(sigilState?.config.agent_files ?? []);
  const extras = detectAgentFiles(gitRoot).filter(f => !covered.has(f));
  if (extras.length > 0) {
    injectIntoAgentFiles(gitRoot, extras, sessionContent);
  }

  if (!opts.quiet) {
    console.log('Session saved.');
    if (opts.note) console.log(`  Note: ${opts.note}`);
    console.log(`  Branch: ${branch} @ ${ref}`);
    if (inProgressTitles.length > 0) {
      console.log(`  In progress: ${inProgressTitles.join(', ')}`);
    }
    const injectedFiles = [...(sigilState?.config.agent_files ?? []), ...extras];
    if (injectedFiles.length > 0) {
      console.log(`  Updated: ${injectedFiles.join(', ')}`);
    }
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function registerSession(program: Command): void {
  const session = program.command('session').description('Session save/resume for pick-up-where-you-left-off');

  session
    .command('save')
    .description('Save a session snapshot (auto-run via hooks)')
    .option('--note <text>', 'What you were working on (shown on resume)')
    .option('--quiet', 'Suppress output (for hook use)')
    .action((options: { note?: string; quiet?: boolean }) => {
      doSessionSave({ note: options.note, quiet: options.quiet });
    });

  program
    .command('resume')
    .description('Print a session briefing to pick up where you left off')
    .action(() => {
      const cwd = process.cwd();
      const gitRoot = getGitRoot(cwd);

      if (!gitRoot) {
        console.error('Not inside a git repository.');
        process.exit(1);
      }

      const currentBranch = getCurrentBranch(cwd);
      const currentRef = getShortRef(cwd);
      const dirtyFiles = getDirtyFiles(cwd);
      const recentCommits = getRecentCommits(3, cwd);
      const sigilState = trySigilInit(gitRoot);
      const lite = readLiteSession(gitRoot);

      let projectName = path.basename(gitRoot);
      let savedAt = lite?.savedAt ?? '';
      let note = lite?.note ?? '';
      let savedBranch = lite?.branch ?? '';
      let savedRef = lite?.ref ?? '';
      let savedInProgress = lite?.inProgress ?? [];
      let activeTasks: TaskRow[] | undefined;
      let activeSpec: FeatureSpecRow | undefined;
      let lastArtifact: ArtifactRow | undefined;
      let governanceScore: string | undefined;
      let openDebtCount: number | undefined;

      if (sigilState) {
        const db = initDb(sigilState.dbPath);
        projectName = sigilState.config.project.name;

        const getMeta = (key: string) =>
          (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? '';

        savedAt = getMeta('session_saved_at') || savedAt;
        note = getMeta('session_note') || note;
        savedBranch = getMeta('session_branch') || savedBranch;
        savedRef = getMeta('session_ref') || savedRef;
        savedInProgress = parseJSON<string[]>(getMeta('session_in_progress'), savedInProgress);

        activeTasks = db.prepare(`
          SELECT * FROM tasks WHERE status != 'done'
          ORDER BY CASE status WHEN 'in_progress' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,
          CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          updated_at DESC LIMIT 10
        `).all() as TaskRow[];

        activeSpec = db.prepare(
          "SELECT * FROM feature_specs WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1"
        ).get() as FeatureSpecRow | undefined;

        lastArtifact = db.prepare(
          "SELECT * FROM artifacts ORDER BY created_at DESC LIMIT 1"
        ).get() as ArtifactRow | undefined;

        governanceScore = getMeta('last_check_score') || undefined;
        openDebtCount = (db.prepare(
          "SELECT COUNT(*) as n FROM technical_debt WHERE status != 'resolved' AND severity IN ('critical','high')"
        ).get() as { n: number }).n;
      }

      const content = buildSessionBlock({
        projectName,
        savedAt,
        note,
        savedBranch,
        savedRef,
        savedInProgress,
        currentBranch,
        currentRef,
        dirtyFiles,
        recentCommits,
        activeTasks,
        activeSpec,
        lastArtifact,
        governanceScore,
        openDebtCount,
      });

      console.log(`# Resume: ${projectName}\n`);
      console.log(content);
      console.log('\n---');
      console.log('Run `sigil session save --note "..."` to leave a note for next session.');
      if (sigilState) {
        console.log('Run `sigil task list` to see all tasks.');
        console.log('Run `sigil check` to assess current governance score.');
      }
    });
}

export function registerSetup(program: Command): void {
  program
    .command('setup')
    .description('One-time setup: install global hooks so session save runs automatically in every project')
    .option('--dry-run', 'Show what would be done without making changes')
    .action((options: { dryRun?: boolean }) => {
      const dry = options.dryRun ?? false;
      const home = os.homedir();
      const results: string[] = [];

      // 1. Global git hooks dir
      const hooksDir = path.join(home, '.git-hooks');
      const postCommit = path.join(hooksDir, 'post-commit');
      const postCommitBody = `#!/bin/sh\nsigil session save --quiet 2>/dev/null || true\n`;

      if (!dry) {
        fs.mkdirSync(hooksDir, { recursive: true });
        if (!fs.existsSync(postCommit)) {
          fs.writeFileSync(postCommit, postCommitBody, { mode: 0o755 });
          results.push(`Created ${postCommit}`);
        } else {
          const existing = fs.readFileSync(postCommit, 'utf-8');
          if (!existing.includes('sigil session save')) {
            fs.writeFileSync(postCommit, existing.trimEnd() + '\n' + postCommitBody, { mode: 0o755 });
            results.push(`Updated ${postCommit} (appended sigil line)`);
          } else {
            results.push(`${postCommit} already has sigil (skipped)`);
          }
        }
      } else {
        results.push(`[dry] Would create/update ${postCommit}`);
      }

      // 2. git config --global core.hooksPath
      try {
        const { execSync } = require('child_process') as typeof import('child_process');
        const existing = (() => { try { return execSync('git config --global core.hooksPath', { stdio: 'pipe' }).toString().trim(); } catch { return ''; } })();
        if (existing && existing !== hooksDir) {
          results.push(`Warning: core.hooksPath already set to '${existing}' — not overwriting. Add sigil to that directory manually.`);
        } else if (existing !== hooksDir) {
          if (!dry) {
            execSync(`git config --global core.hooksPath "${hooksDir}"`, { stdio: 'pipe' });
            results.push(`Set git config --global core.hooksPath = ${hooksDir}`);
          } else {
            results.push(`[dry] Would set git config --global core.hooksPath = ${hooksDir}`);
          }
        } else {
          results.push(`git core.hooksPath already set correctly (skipped)`);
        }
      } catch {
        results.push('Warning: Could not set git global core.hooksPath');
      }

      // 3. Global Claude Code Stop hook (~/.claude/settings.json)
      const claudeSettings = path.join(home, '.claude', 'settings.json');
      try {
        let settings: Record<string, unknown> = {};
        if (fs.existsSync(claudeSettings)) {
          settings = JSON.parse(fs.readFileSync(claudeSettings, 'utf-8'));
        }

        const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
        const stopHooks = (hooks.Stop ?? []) as Array<{ hooks: Array<{ type: string; command: string }> }>;
        const alreadyHasIt = stopHooks.some(h =>
          h.hooks?.some(hh => hh.command?.includes('sigil session save'))
        );

        if (!alreadyHasIt) {
          stopHooks.push({ hooks: [{ type: 'command', command: 'sigil session save --quiet 2>/dev/null || true' }] });
          hooks.Stop = stopHooks;
          settings.hooks = hooks;
          if (!dry) {
            fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
            fs.writeFileSync(claudeSettings, JSON.stringify(settings, null, 2), 'utf-8');
            results.push(`Updated ${claudeSettings} with Stop hook`);
          } else {
            results.push(`[dry] Would update ${claudeSettings} with Stop hook`);
          }
        } else {
          results.push(`${claudeSettings} already has Stop hook (skipped)`);
        }
      } catch {
        results.push('Warning: Could not update ~/.claude/settings.json');
      }

      // 4. Shell rc instructions
      const shellRcLine = `\n# sigil session auto-save on terminal exit\ntrap 'sigil session save --quiet 2>/dev/null || true' EXIT\n`;
      const zshrc = path.join(home, '.zshrc');
      const bashrc = path.join(home, '.bashrc');

      for (const rcFile of [zshrc, bashrc]) {
        if (!fs.existsSync(rcFile)) continue;
        const existing = fs.readFileSync(rcFile, 'utf-8');
        if (existing.includes('sigil session save')) {
          results.push(`${rcFile} already has EXIT trap (skipped)`);
        } else {
          if (!dry) {
            fs.appendFileSync(rcFile, shellRcLine);
            results.push(`Added EXIT trap to ${rcFile}`);
          } else {
            results.push(`[dry] Would add EXIT trap to ${rcFile}`);
          }
        }
      }

      console.log('sigil setup' + (dry ? ' (dry run)' : ''));
      console.log('');
      results.forEach(r => console.log(`  ${r}`));
      console.log('');
      if (!dry) {
        console.log('Done. Session state will now auto-save in every git project after commits,');
        console.log('when Claude Code finishes responding, and when your terminal closes.');
        console.log('');
        console.log('Note: the EXIT trap takes effect in new terminal sessions.');
      }
    });
}
