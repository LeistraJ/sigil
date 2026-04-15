import { DB } from '../db/connection';

import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SigilConfig, IngestResult, TechnicalDebtRow } from '../types';
import { isGitRepo, getHeadRef, getDiffSinceRef, getChangedFilesMtime } from '../utils/git';
import { scanForComments, countLines, isSourceFile } from '../utils/scanner';
import { nowIso, stringifyJSON } from '../utils/format';
import { regenerateContextFiles } from './regenerate';

export function runIngest(
  db: DB,
  config: SigilConfig,
  options: { agent?: string; quiet?: boolean } = {}
): IngestResult {
  const cwd = process.cwd();
  const agent = options.agent ?? 'unknown';
  const now = nowIso();

  // 1. Get last checkpoint
  const lastRef = (db.prepare('SELECT value FROM meta WHERE key = ?').get('last_ingest_ref') as { value: string } | undefined)?.value ?? '';
  const lastTimestamp = (db.prepare('SELECT value FROM meta WHERE key = ?').get('last_ingest_timestamp') as { value: string } | undefined)?.value ?? '';

  // 2. Determine changed files
  let filesAdded: string[] = [];
  let filesModified: string[] = [];
  let filesDeleted: string[] = [];

  // Files that Sigil itself manages — exclude from user-facing diffs
  const sigilManagedFiles = new Set([
    ...config.agent_files,
    '.sigil/config.json',
    '.sigil/sigil.db',
    '.sigil/exports/context-latest.md',
    '.gitignore',
  ]);
  const isUserFile = (f: string) =>
    !f.startsWith('.sigil/') && !sigilManagedFiles.has(f);

  if (isGitRepo(cwd)) {
    const currentRef = getHeadRef(cwd);

    if (lastRef && currentRef && lastRef !== currentRef) {
      const diff = getDiffSinceRef(lastRef, cwd);
      filesAdded = diff.added.filter(isUserFile);
      filesModified = diff.modified.filter(isUserFile);
      filesDeleted = diff.deleted.filter(isUserFile);
    } else if (!lastRef && currentRef) {
      // First ingest — treat all tracked files as "added"
      const diff = getDiffSinceRef('HEAD~1', cwd);
      filesAdded = diff.added.filter(isUserFile);
      filesModified = diff.modified.filter(isUserFile);
    }
  } else if (lastTimestamp) {
    // Non-git: use mtime
    const changed = getChangedFilesMtime(lastTimestamp, cwd);
    filesModified = changed;
  } else {
    // First ingest without git — just note it happened
  }

  const allChangedFiles = [...filesAdded, ...filesModified];

  // Check for nothing to do
  if (allChangedFiles.length === 0 && filesDeleted.length === 0 && lastRef !== '') {
    return {
      nothingToDo: true,
      filesAdded: [],
      filesModified: [],
      filesDeleted: [],
      newDebtFound: 0,
      oversizedFiles: [],
      artifactId: null,
    };
  }

  // 3. Scan changed files
  const oversizedFiles: string[] = [];
  const foundComments: Array<{ file: string; line: number; type: string; text: string }> = [];
  const maxLines = config.thresholds.max_file_lines;

  for (const relFile of allChangedFiles) {
    if (!isSourceFile(relFile)) continue;
    const absPath = path.join(cwd, relFile);

    // Check line count
    const lines = countLines(absPath);
    if (lines > maxLines) {
      oversizedFiles.push(relFile);
    }

    // Scan for comments
    const hits = scanForComments(absPath);
    for (const hit of hits) {
      foundComments.push({
        file: relFile,
        line: hit.line,
        type: hit.type,
        text: hit.text,
      });
    }
  }

  // 4. Find untracked debt comments
  const existingDebt = db.prepare(`
    SELECT file, line_range FROM technical_debt WHERE status != 'resolved'
  `).all() as Pick<TechnicalDebtRow, 'file' | 'line_range'>[];

  const existingKeys = new Set(
    existingDebt.map(d => `${d.file}:${d.line_range}`)
  );

  const newDebt = foundComments.filter(c => {
    const key = `${c.file}:${c.line}`;
    return !existingKeys.has(key);
  });

  // 5. Record artifact
  const artifactId = uuidv4();
  const currentRef = isGitRepo(cwd) ? getHeadRef(cwd) : null;
  const summary = buildSummary(filesAdded, filesModified, filesDeleted, newDebt.length, oversizedFiles.length);

  db.prepare(`
    INSERT INTO artifacts (id, timestamp, source, agent, summary, files_touched, files_added, files_removed, debt_discovered, structure_issues, git_ref, created_at)
    VALUES (?, ?, 'ingest', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artifactId,
    now,
    agent,
    summary,
    stringifyJSON([...filesAdded, ...filesModified]),
    stringifyJSON(filesAdded),
    stringifyJSON(filesDeleted),
    stringifyJSON(newDebt.map(d => `${d.type}:${d.file}:${d.line}`)),
    stringifyJSON(oversizedFiles.map(f => `oversized:${f}`)),
    currentRef ?? null,
    now
  );

  // 6. Update meta checkpoint
  const metaUpdate = db.prepare(`
    INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES (?, ?, ?)
  `);
  if (currentRef) {
    metaUpdate.run('last_ingest_ref', currentRef, now);
  }
  metaUpdate.run('last_ingest_timestamp', now, now);

  // 7. Log event
  db.prepare(`
    INSERT INTO events (id, type, data, created_at) VALUES (?, 'ingest', ?, ?)
  `).run(uuidv4(), stringifyJSON({
    files_added: filesAdded.length,
    files_modified: filesModified.length,
    files_deleted: filesDeleted.length,
    new_debt: newDebt.length,
    oversized: oversizedFiles.length,
  }), now);

  // 8. Regenerate context files
  regenerateContextFiles(db, config);

  return {
    nothingToDo: false,
    filesAdded,
    filesModified,
    filesDeleted,
    newDebtFound: newDebt.length,
    oversizedFiles,
    artifactId,
  };
}

function buildSummary(
  added: string[],
  modified: string[],
  deleted: string[],
  newDebt: number,
  oversized: number
): string {
  const parts: string[] = [];
  if (added.length > 0) parts.push(`${added.length} added`);
  if (modified.length > 0) parts.push(`${modified.length} modified`);
  if (deleted.length > 0) parts.push(`${deleted.length} deleted`);
  if (newDebt > 0) parts.push(`${newDebt} new debt comments`);
  if (oversized > 0) parts.push(`${oversized} oversized files`);
  return parts.length > 0 ? parts.join(', ') : 'no changes detected';
}
