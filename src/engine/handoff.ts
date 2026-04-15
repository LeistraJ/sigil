import { DB } from '../db/connection';

import {
  SigilConfig, HandoffMode, TaskRow, ArchitectureRuleRow, ConstraintRow,
  DecisionRow, TechnicalDebtRow, ArtifactRow, FeatureSpecRow,
} from '../types';
import { parseJSON, formatDate, truncate } from '../utils/format';

export function buildHandoff(
  db: DB,
  config: SigilConfig,
  mode: HandoffMode = 'agent'
): string {
  switch (mode) {
    case 'agent':  return buildAgentHandoff(db, config);
    case 'human':  return buildHumanHandoff(db, config);
    case 'sprint': return buildSprintHandoff(db, config);
  }
}

function buildAgentHandoff(db: DB, config: SigilConfig): string {
  const now = new Date().toISOString();

  // Current objective = first active spec or most recent task
  const activeSpec = db.prepare(`
    SELECT * FROM feature_specs WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1
  `).get() as FeatureSpecRow | undefined;

  // Tasks
  const activeTasks = db.prepare(`
    SELECT * FROM tasks WHERE status != 'done'
    ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
    created_at ASC LIMIT 15
  `).all() as TaskRow[];

  const totalTasks = (db.prepare("SELECT COUNT(*) as n FROM tasks").get() as { n: number }).n;
  const doneTasks = (db.prepare("SELECT COUNT(*) as n FROM tasks WHERE status = 'done'").get() as { n: number }).n;

  // Rules (violations only for brevity)
  const rules = db.prepare(`
    SELECT * FROM architecture_rules WHERE enabled = 1 AND severity = 'violation'
    AND (scope = 'all' OR scope = ?)
    ORDER BY title ASC
  `).all(config.project.type) as ArchitectureRuleRow[];

  // Constraints
  const constraints = db.prepare(`
    SELECT * FROM constraints WHERE enabled = 1 ORDER BY title ASC LIMIT 10
  `).all() as ConstraintRow[];

  // Recent decisions
  const decisions = db.prepare(`
    SELECT * FROM decisions ORDER BY created_at DESC LIMIT 5
  `).all() as DecisionRow[];

  // Open critical/high debt
  const debt = db.prepare(`
    SELECT * FROM technical_debt WHERE status != 'resolved' AND severity IN ('critical','high')
    ORDER BY severity DESC, created_at ASC LIMIT 10
  `).all() as TechnicalDebtRow[];

  // Last artifact
  const lastArtifact = db.prepare(`
    SELECT * FROM artifacts ORDER BY created_at DESC LIMIT 1
  `).get() as ArtifactRow | undefined;

  const lines: string[] = [
    `# Handoff: ${config.project.name}`,
    `Generated: ${formatDate(now)}`,
    '',
    '## OBJECTIVE',
    activeSpec ? activeSpec.goal : 'No active feature spec — check tasks for current work.',
    '',
    '## CURRENT STATE',
  ];

  if (activeSpec) {
    lines.push(`- Status: building`);
    lines.push(`- Active feature: ${activeSpec.title}`);
    lines.push(`- Completion: ${doneTasks} of ${totalTasks} tasks done`);
  } else {
    lines.push(`- Completion: ${doneTasks} of ${totalTasks} tasks done`);
  }

  lines.push('', '## YOUR TASKS (ordered by priority)');
  if (activeTasks.length === 0) {
    lines.push('No open tasks.');
  } else {
    activeTasks.forEach((t, i) => {
      const desc = t.description ? ` — ${truncate(t.description, 80)}` : '';
      lines.push(`${i + 1}. [${t.status}] [${t.priority}] ${t.title}${desc}`);
    });
  }

  lines.push('', '## ACTIVE RULES (do not violate)');
  if (rules.length === 0) {
    lines.push('No violation-level rules. See `sigil rule list` for all rules.');
  } else {
    rules.forEach(r => lines.push(`- **${r.title}**: ${r.check}`));
  }

  lines.push('', '## CONSTRAINTS');
  if (constraints.length === 0) {
    lines.push('No constraints defined.');
  } else {
    constraints.forEach(c => lines.push(`- ${c.title}: ${c.description}`));
  }

  lines.push('', '## RECENT DECISIONS (honor these)');
  if (decisions.length === 0) {
    lines.push('No decisions recorded yet.');
  } else {
    decisions.forEach(d => lines.push(`- **${d.title}**: ${d.rationale}`));
  }

  lines.push('', '## KNOWN DEBT (do not add without tracking)');
  if (debt.length === 0) {
    lines.push('No critical/high debt open.');
  } else {
    debt.forEach(d => {
      const loc = d.file ? ` in \`${d.file}\`` : '';
      lines.push(`- [${d.severity}] [${d.category}] ${d.title}${loc}: ${d.description}`);
    });
  }

  if (lastArtifact) {
    const touched = parseJSON<string[]>(lastArtifact.files_touched, []);
    lines.push('', '## LAST SESSION WORK');
    lines.push(`- Files modified: ${touched.length > 0 ? touched.slice(0, 8).join(', ') : 'none recorded'}`);
    if (lastArtifact.summary) lines.push(`- What was done: ${lastArtifact.summary}`);
  }

  lines.push('', '## NEXT STEPS');
  const todoTasks = activeTasks.filter(t => t.status === 'todo').slice(0, 3);
  if (todoTasks.length > 0) {
    todoTasks.forEach((t, i) => lines.push(`${i + 1}. ${t.title}`));
  } else {
    lines.push('1. Review active tasks with `sigil task list`');
    lines.push('2. Run `sigil check` to assess governance score');
    lines.push('3. Run `sigil ingest` after completing work');
  }

  return lines.join('\n');
}

function buildHumanHandoff(db: DB, config: SigilConfig): string {
  const activeSpec = db.prepare(`
    SELECT * FROM feature_specs WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1
  `).get() as FeatureSpecRow | undefined;

  const activeTasks = db.prepare(`
    SELECT * FROM tasks WHERE status != 'done'
    ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
    LIMIT 10
  `).all() as TaskRow[];

  const criticalDebt = db.prepare(`
    SELECT * FROM technical_debt WHERE status != 'resolved' AND severity = 'critical' LIMIT 5
  `).all() as TechnicalDebtRow[];

  const lastArtifact = db.prepare(`
    SELECT * FROM artifacts ORDER BY created_at DESC LIMIT 1
  `).get() as ArtifactRow | undefined;

  const lines: string[] = [
    `# ${config.project.name} — Handoff Document`,
    `Generated: ${formatDate(new Date().toISOString())}`,
    '',
    '## What We\'re Building',
  ];

  if (activeSpec) {
    lines.push(`**${activeSpec.title}**`);
    lines.push('');
    lines.push(activeSpec.goal);
    lines.push('');
    lines.push(`*Scope*: ${activeSpec.scope}`);

    const criteria = parseJSON<string[]>(activeSpec.acceptance_criteria, []);
    if (criteria.length > 0) {
      lines.push('');
      lines.push('Done when:');
      criteria.forEach(c => lines.push(`- ${c}`));
    }
  } else {
    lines.push('No active feature spec. Check the task list below.');
  }

  lines.push('', '## What Needs Doing');
  const urgent = activeTasks.filter(t => t.priority === 'critical' || t.priority === 'high');
  const normal = activeTasks.filter(t => t.priority === 'medium' || t.priority === 'low');

  if (urgent.length > 0) {
    lines.push('\n### Urgent');
    urgent.forEach(t => lines.push(`- [${t.status}] **${t.title}**${t.description ? `\n  ${t.description}` : ''}`));
  }
  if (normal.length > 0) {
    lines.push('\n### Normal priority');
    normal.forEach(t => lines.push(`- [${t.status}] ${t.title}`));
  }

  if (criticalDebt.length > 0) {
    lines.push('', '## Known Issues (Critical Debt)');
    lines.push('These must be addressed:');
    criticalDebt.forEach(d => {
      lines.push(`- **${d.title}** (${d.category}): ${d.description}${d.file ? ` — \`${d.file}\`` : ''}`);
    });
  }

  if (lastArtifact?.summary) {
    lines.push('', '## What Was Done Last');
    lines.push(lastArtifact.summary);
  }

  return lines.join('\n');
}

function buildSprintHandoff(db: DB, config: SigilConfig): string {
  const doneTasks = db.prepare(`
    SELECT * FROM tasks WHERE status = 'done' ORDER BY updated_at DESC LIMIT 5
  `).all() as TaskRow[];

  const inProgress = db.prepare(`
    SELECT * FROM tasks WHERE status = 'in_progress' ORDER BY priority DESC
  `).all() as TaskRow[];

  const blocked = db.prepare(`
    SELECT * FROM tasks WHERE status = 'blocked'
  `).all() as TaskRow[];

  const score = (db.prepare("SELECT value FROM meta WHERE key = 'last_check_score'").get() as { value: string } | undefined)?.value ?? 'n/a';

  const lines: string[] = [
    `# Sprint Update: ${config.project.name}`,
    `${formatDate(new Date().toISOString())}`,
    '',
  ];

  lines.push('**Done:**');
  if (doneTasks.length > 0) doneTasks.forEach(t => lines.push(`- ${t.title}`));
  else lines.push('- Nothing completed recently');

  lines.push('', '**In Progress:**');
  if (inProgress.length > 0) inProgress.forEach(t => lines.push(`- ${t.title}`));
  else lines.push('- Nothing in progress');

  if (blocked.length > 0) {
    lines.push('', '**Blocked:**');
    blocked.forEach(t => lines.push(`- ${t.title}${t.description ? ` — ${t.description}` : ''}`));
  }

  lines.push('', `**Governance score:** ${score}/100`);

  return lines.join('\n');
}
