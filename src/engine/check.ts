import { DB } from '../db/connection';

import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SigilConfig, CheckResult, CheckIssue, TechnicalDebtRow, TaskRow, FeatureSpecRow, DecisionRow } from '../types';
import { scanDirectory, scanForComments, countLines } from '../utils/scanner';
import { nowIso, daysSince, stringifyJSON } from '../utils/format';

export function runCheck(db: DB, config: SigilConfig): CheckResult {
  const cwd = process.cwd();
  const issues: CheckIssue[] = [];
  const now = nowIso();

  // ── 1. File-level checks ────────────────────────────────────────────────────

  const maxLines = config.thresholds.max_file_lines;
  const sourceFiles = scanDirectory(cwd);

  for (const filePath of sourceFiles) {
    const relPath = path.relative(cwd, filePath);
    const lines = countLines(filePath);

    if (lines > maxLines) {
      issues.push({
        type: 'warning',
        category: 'file_size',
        message: `File exceeds ${maxLines} line threshold (${lines} lines)`,
        file: relPath,
      });
    }

    // Check for untracked TODO/HACK/FIXME
    const comments = scanForComments(filePath);
    for (const comment of comments) {
      const existing = db.prepare(`
        SELECT id FROM technical_debt WHERE file = ? AND line_range = ? AND status != 'resolved'
      `).get(relPath, String(comment.line));

      if (!existing) {
        issues.push({
          type: 'info',
          category: 'untracked_debt',
          message: `Untracked ${comment.type}: ${comment.text || '(no message)'}`,
          file: relPath,
          line: comment.line,
        });
      }
    }
  }

  // ── 2. Debt aging checks ────────────────────────────────────────────────────

  const openDebt = db.prepare(`
    SELECT * FROM technical_debt WHERE status != 'resolved'
  `).all() as TechnicalDebtRow[];

  for (const debt of openDebt) {
    const age = daysSince(debt.created_at);

    let limit: number;
    let issueType: CheckIssue['type'];

    switch (debt.severity) {
      case 'critical':
        limit = config.thresholds.debt_aging_critical_days;
        issueType = 'violation';
        break;
      case 'high':
        limit = config.thresholds.debt_aging_high_days;
        issueType = 'warning';
        break;
      default:
        limit = config.thresholds.debt_aging_stale_days;
        issueType = 'info';
    }

    if (age > limit) {
      issues.push({
        type: issueType,
        category: 'debt_aging',
        message: `[${debt.severity}] "${debt.title}" is ${age} days old (limit: ${limit}d) — ${debt.category}`,
        file: debt.file ?? undefined,
      });
    }
  }

  // ── 3. Governance checks ────────────────────────────────────────────────────

  // Decisions without rationale
  const emptyRationale = db.prepare(`
    SELECT id, title FROM decisions WHERE rationale IS NULL OR rationale = ''
  `).all() as { id: string; title: string }[];

  for (const d of emptyRationale) {
    issues.push({
      type: 'warning',
      category: 'governance',
      message: `Decision "${d.title}" has no rationale`,
    });
  }

  // Tasks not linked to any feature spec
  const unlinkedTasks = db.prepare(`
    SELECT id, title FROM tasks WHERE feature_spec_id IS NULL AND status != 'done'
  `).all() as { id: string; title: string }[];

  for (const t of unlinkedTasks) {
    issues.push({
      type: 'info',
      category: 'governance',
      message: `Task "${t.title}" is not linked to a feature spec`,
    });
  }

  // Feature specs missing acceptance criteria
  const specsNoAC = db.prepare(`
    SELECT id, title FROM feature_specs
    WHERE status IN ('draft','active')
    AND (acceptance_criteria IS NULL OR acceptance_criteria = '[]' OR acceptance_criteria = '')
  `).all() as { id: string; title: string }[];

  for (const s of specsNoAC) {
    issues.push({
      type: 'warning',
      category: 'governance',
      message: `Spec "${s.title}" has no acceptance criteria`,
    });
  }

  // ── 4. Calculate score ──────────────────────────────────────────────────────

  let violations = 0, warnings = 0, infos = 0;
  for (const issue of issues) {
    if (issue.type === 'violation') violations++;
    else if (issue.type === 'warning') warnings++;
    else infos++;
  }

  const score = Math.max(0, 100 - (violations * 8) - (warnings * 3) - (infos * 1));

  // ── 5. Log check event ──────────────────────────────────────────────────────

  db.prepare(`
    INSERT INTO events (id, type, data, created_at) VALUES (?, 'governance_check', ?, ?)
  `).run(uuidv4(), stringifyJSON({ score, violations, warnings, infos }), now);

  db.prepare(`
    INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES ('last_check_score', ?, ?)
  `).run(String(score), now);

  return {
    score,
    violations,
    warnings,
    infos,
    issues,
    checkedAt: now,
  };
}
