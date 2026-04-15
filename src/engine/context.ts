import { DB } from '../db/connection';

import {
  SigilConfig, ContextProfile, AssembledContext, ContextSection,
  ArchitectureRuleRow, ConstraintRow, AntiPatternRow, CodePatternRow,
  TaskRow, FeatureSpecRow, DecisionRow, TechnicalDebtRow, ArtifactRow,
} from '../types';
import { parseJSON, nowIso, formatDate, truncate } from '../utils/format';
import { estimateTokens } from '../utils/tokens';

// ─── Profile Definitions ──────────────────────────────────────────────────────

const PROFILE_CONFIG: Record<ContextProfile, {
  sections: string[];
  description: string;
}> = {
  builder: {
    description: 'Active development context — tasks, rules, patterns, recent work',
    sections: ['project', 'active_tasks', 'rules', 'constraints', 'anti_patterns', 'patterns', 'recent_decisions', 'critical_debt', 'active_specs', 'recent_artifacts'],
  },
  reviewer: {
    description: 'Review context — decisions, rules, anti-patterns, debt',
    sections: ['project', 'rules', 'anti_patterns', 'constraints', 'decisions', 'debt', 'active_specs', 'recent_artifacts'],
  },
  planner: {
    description: 'Planning context — tasks, constraints, decisions, dependencies',
    sections: ['project', 'active_specs', 'active_tasks', 'constraints', 'decisions', 'patterns'],
  },
  debugger: {
    description: 'Debug context — recent artifacts, rules, debt, decisions',
    sections: ['project', 'recent_artifacts', 'rules', 'constraints', 'critical_debt', 'recent_decisions'],
  },
};

// ─── Section Priorities ───────────────────────────────────────────────────────

const SECTION_PRIORITY: Record<string, 'always' | 'high' | 'medium' | 'low'> = {
  project: 'always',
  rules: 'always',
  constraints: 'always',
  active_tasks: 'always',
  anti_patterns: 'high',
  recent_decisions: 'high',
  critical_debt: 'high',
  patterns: 'medium',
  active_specs: 'medium',
  debt: 'medium',
  decisions: 'medium',
  recent_artifacts: 'low',
  historical_decisions: 'low',
};

// ─── Context Assembly ─────────────────────────────────────────────────────────

export function assembleContext(
  db: DB,
  config: SigilConfig,
  profile: ContextProfile,
  tokenBudget?: number
): AssembledContext {
  const budget = tokenBudget ?? config.max_context_tokens;
  const profileCfg = PROFILE_CONFIG[profile];
  const sections: ContextSection[] = [];
  let usedTokens = 0;
  let truncated = false;

  for (const sectionName of profileCfg.sections) {
    const content = buildSection(db, config, sectionName);
    if (!content) continue;

    const priority = SECTION_PRIORITY[sectionName] ?? 'low';
    const tokens = estimateTokens(content);

    if (priority === 'always' || usedTokens + tokens <= budget) {
      sections.push({
        title: sectionTitle(sectionName),
        content,
        tokenEstimate: tokens,
        priority,
      });
      usedTokens += tokens;
    } else {
      truncated = true;
    }
  }

  return {
    projectName: config.project.name,
    projectType: config.project.type,
    profile,
    generatedAt: nowIso(),
    sections,
    totalTokens: usedTokens,
    truncated,
  };
}

function sectionTitle(name: string): string {
  const titles: Record<string, string> = {
    project: 'Project Overview',
    rules: 'Architecture Rules',
    constraints: 'Constraints',
    active_tasks: 'Active Tasks',
    anti_patterns: 'Anti-Patterns to Avoid',
    patterns: 'Established Patterns',
    recent_decisions: 'Recent Decisions',
    critical_debt: 'Critical Technical Debt',
    debt: 'Technical Debt',
    active_specs: 'Active Feature Specs',
    decisions: 'Architectural Decisions',
    recent_artifacts: 'Recent Session Work',
    historical_decisions: 'Historical Decisions',
  };
  return titles[name] ?? name;
}

// ─── Section Builders ─────────────────────────────────────────────────────────

function buildSection(db: DB, config: SigilConfig, name: string): string | null {
  switch (name) {
    case 'project':         return buildProjectSection(db, config);
    case 'rules':           return buildRulesSection(db, config);
    case 'constraints':     return buildConstraintsSection(db);
    case 'active_tasks':    return buildActiveTasksSection(db);
    case 'anti_patterns':   return buildAntiPatternsSection(db, config);
    case 'patterns':        return buildPatternsSection(db);
    case 'recent_decisions':return buildDecisionsSection(db, 5);
    case 'decisions':       return buildDecisionsSection(db, 20);
    case 'critical_debt':   return buildDebtSection(db, ['critical', 'high'], 'open');
    case 'debt':            return buildDebtSection(db, ['critical', 'high', 'medium'], 'open');
    case 'active_specs':    return buildSpecsSection(db);
    case 'recent_artifacts':return buildArtifactsSection(db, 3);
    default:                return null;
  }
}

function buildProjectSection(db: DB, config: SigilConfig): string {
  const project = db.prepare('SELECT * FROM projects LIMIT 1').get() as { name: string; type: string; description: string | null } | undefined;
  const ruleCount = (db.prepare('SELECT COUNT(*) as n FROM architecture_rules WHERE enabled=1').get() as { n: number }).n;
  const taskCount = (db.prepare("SELECT COUNT(*) as n FROM tasks WHERE status != 'done'").get() as { n: number }).n;
  const debtCount = (db.prepare("SELECT COUNT(*) as n FROM technical_debt WHERE status != 'resolved'").get() as { n: number }).n;

  const lines = [
    `**Name**: ${config.project.name}`,
    `**Type**: ${config.project.type}`,
  ];
  if (project?.description) lines.push(`**Description**: ${project.description}`);
  lines.push(`**Active rules**: ${ruleCount} | **Open tasks**: ${taskCount} | **Open debt**: ${debtCount}`);

  return lines.join('\n');
}

function buildRulesSection(db: DB, config: SigilConfig): string | null {
  const rows = db.prepare(`
    SELECT * FROM architecture_rules
    WHERE enabled = 1
    AND (scope = 'all' OR scope = ?)
    ORDER BY severity DESC, title ASC
  `).all(config.project.type) as ArchitectureRuleRow[];

  if (rows.length === 0) return null;

  return rows.map(r => {
    const parts = [`**${r.title}** [${r.severity.toUpperCase()}]`];
    parts.push(`  ${r.description}`);
    parts.push(`  *Check*: ${r.check}${r.threshold ? ` (threshold: ${r.threshold})` : ''}`);
    return parts.join('\n');
  }).join('\n\n');
}

function buildConstraintsSection(db: DB): string | null {
  const rows = db.prepare(`
    SELECT * FROM constraints WHERE enabled = 1 ORDER BY title ASC
  `).all() as ConstraintRow[];

  if (rows.length === 0) return null;

  return rows.map(r => `- **${r.title}**: ${r.description}`).join('\n');
}

function buildActiveTasksSection(db: DB): string | null {
  const rows = db.prepare(`
    SELECT t.*, fs.title as spec_title FROM tasks t
    LEFT JOIN feature_specs fs ON t.feature_spec_id = fs.id
    WHERE t.status != 'done'
    ORDER BY CASE t.priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END, t.created_at ASC
  `).all() as (TaskRow & { spec_title?: string })[];

  if (rows.length === 0) return null;

  return rows.map(t => {
    const status = `[${t.status.toUpperCase()}]`;
    const priority = `[${t.priority}]`;
    const spec = t.spec_title ? ` (${t.spec_title})` : '';
    const desc = t.description ? `\n  ${truncate(t.description, 120)}` : '';
    return `- ${status} ${priority} **${t.title}**${spec}${desc}`;
  }).join('\n');
}

function buildAntiPatternsSection(db: DB, config: SigilConfig): string | null {
  const rows = db.prepare(`
    SELECT * FROM anti_patterns
    WHERE enabled = 1
    AND (scope = 'all' OR scope = ?)
    ORDER BY severity DESC, name ASC
  `).all(config.project.type) as AntiPatternRow[];

  if (rows.length === 0) return null;

  return rows.map(ap => {
    const signals = parseJSON<string[]>(ap.detection_signals, []);
    const parts = [
      `**${ap.name}** [${ap.severity.toUpperCase()}]`,
      `  ${ap.description}`,
      `  *Why harmful*: ${ap.why_harmful}`,
      `  *Signals*: ${signals.join('; ')}`,
      `  *Resolution*: ${ap.resolution}`,
    ];
    return parts.join('\n');
  }).join('\n\n');
}

function buildPatternsSection(db: DB): string | null {
  const rows = db.prepare(`
    SELECT * FROM code_patterns ORDER BY title ASC
  `).all() as CodePatternRow[];

  if (rows.length === 0) return null;

  return rows.map(p => {
    const parts = [
      `**${p.title}**`,
      `  *Purpose*: ${p.purpose}`,
      `  *Use when*: ${p.when_to_use}`,
      `  *Avoid when*: ${p.when_not_to_use}`,
    ];
    if (p.notes) parts.push(`  *Notes*: ${p.notes}`);
    return parts.join('\n');
  }).join('\n\n');
}

function buildDecisionsSection(db: DB, limit: number): string | null {
  const rows = db.prepare(`
    SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?
  `).all(limit) as DecisionRow[];

  if (rows.length === 0) return null;

  return rows.map(d => {
    const parts = [
      `**${d.title}** (${formatDate(d.created_at)})`,
      `  ${d.description}`,
      `  *Rationale*: ${d.rationale}`,
    ];
    if (d.made_by) parts.push(`  *Made by*: ${d.made_by}`);
    return parts.join('\n');
  }).join('\n\n');
}

function buildDebtSection(db: DB, severities: string[], status: string): string | null {
  const placeholders = severities.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT * FROM technical_debt
    WHERE severity IN (${placeholders})
    AND status = ?
    ORDER BY CASE severity
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END, created_at ASC
  `).all(...severities, status) as TechnicalDebtRow[];

  if (rows.length === 0) return null;

  return rows.map(d => {
    const loc = d.file ? ` in \`${d.file}${d.line_range ? `:${d.line_range}` : ''}\`` : '';
    return `- [${d.severity.toUpperCase()}] [${d.category}] **${d.title}**${loc}\n  ${d.description}`;
  }).join('\n');
}

function buildSpecsSection(db: DB): string | null {
  const rows = db.prepare(`
    SELECT fs.*, (
      SELECT COUNT(*) FROM tasks WHERE feature_spec_id = fs.id AND status != 'done'
    ) as open_tasks FROM feature_specs fs
    WHERE fs.status IN ('draft', 'active')
    ORDER BY fs.updated_at DESC
  `).all() as (FeatureSpecRow & { open_tasks: number })[];

  if (rows.length === 0) return null;

  return rows.map(s => {
    const criteria = parseJSON<string[]>(s.acceptance_criteria, []);
    const parts = [
      `**${s.title}** [${s.status.toUpperCase()}] — ${s.open_tasks} open task(s)`,
      `  *Goal*: ${s.goal}`,
      `  *Scope*: ${s.scope}`,
    ];
    if (criteria.length > 0) {
      parts.push('  *Acceptance criteria*:');
      criteria.slice(0, 5).forEach(c => parts.push(`    - ${c}`));
    }
    return parts.join('\n');
  }).join('\n\n');
}

function buildArtifactsSection(db: DB, limit: number): string | null {
  const rows = db.prepare(`
    SELECT * FROM artifacts ORDER BY created_at DESC LIMIT ?
  `).all(limit) as ArtifactRow[];

  if (rows.length === 0) return null;

  return rows.map(a => {
    const touched = parseJSON<string[]>(a.files_touched, []);
    const added = parseJSON<string[]>(a.files_added, []);
    const removed = parseJSON<string[]>(a.files_removed, []);
    const parts = [
      `**${formatDate(a.timestamp)}** (agent: ${a.agent})`,
    ];
    if (a.summary) parts.push(`  ${a.summary}`);
    if (added.length > 0) parts.push(`  Added: ${added.slice(0, 5).join(', ')}`);
    if (touched.length > 0) parts.push(`  Modified: ${touched.slice(0, 5).join(', ')}`);
    if (removed.length > 0) parts.push(`  Removed: ${removed.slice(0, 3).join(', ')}`);
    return parts.join('\n');
  }).join('\n\n');
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

export function renderContextMarkdown(ctx: AssembledContext): string {
  const lines: string[] = [
    `# Sigil Context — ${ctx.projectName}`,
    `> Profile: **${ctx.profile}** | Generated: ${formatDate(ctx.generatedAt)} | ~${ctx.totalTokens} tokens${ctx.truncated ? ' (truncated)' : ''}`,
    '',
    '---',
    '',
  ];

  for (const section of ctx.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(section.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`*Generated by Sigil — do not edit this section manually*`);

  return lines.join('\n');
}
