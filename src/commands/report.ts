import { Command } from 'commander';
import { initDb } from '../db/connection';
import { requireSigilInit, formatDate, daysSince } from '../utils/format';
import { TechnicalDebtRow, ArtifactRow, EventRow } from '../types';

function parseDurationArg(since: string): number {
  const match = since.match(/^(\d+)([dD])$/);
  if (match) return parseInt(match[1], 10);
  return 7; // default 7 days
}

export function registerReport(program: Command): void {
  const report = program
    .command('report')
    .description('Generate reports');

  report
    .command('governance')
    .description('Full governance health report')
    .option('--since <duration>', 'Time window, e.g. 7d, 30d, 90d', '30d')
    .option('--format <fmt>', 'Output format: text (default), json, markdown')
    .action((options: { since?: string; format?: string }) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const days = parseDurationArg(options.since ?? '30d');
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Health score from events
      const checkEvents = db.prepare(`
        SELECT data, created_at FROM events
        WHERE type = 'governance_check'
        AND created_at >= ?
        ORDER BY created_at ASC
      `).all(sinceDate) as { data: string; created_at: string }[];

      const scores = checkEvents.map(e => {
        try { return { score: (JSON.parse(e.data) as { score: number }).score, date: e.created_at }; }
        catch { return null; }
      }).filter(Boolean) as { score: number; date: string }[];

      const currentScore = (db.prepare("SELECT value FROM meta WHERE key = 'last_check_score'").get() as { value: string } | undefined)?.value ?? 'n/a';
      const trend = scores.length >= 2
        ? (scores[scores.length - 1].score > scores[0].score ? 'improving' : scores[scores.length - 1].score < scores[0].score ? 'declining' : 'stable')
        : 'stable';

      // Debt summary
      const debtRows = db.prepare(`
        SELECT * FROM technical_debt WHERE status != 'resolved'
        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
      `).all() as TechnicalDebtRow[];

      const debtByCat: Record<string, number> = {};
      const debtBySev: Record<string, number> = {};
      const agingDebt: TechnicalDebtRow[] = [];

      for (const d of debtRows) {
        debtByCat[d.category] = (debtByCat[d.category] ?? 0) + 1;
        debtBySev[d.severity] = (debtBySev[d.severity] ?? 0) + 1;

        const age = daysSince(d.created_at);
        const limit = d.severity === 'critical' ? config.thresholds.debt_aging_critical_days
          : d.severity === 'high' ? config.thresholds.debt_aging_high_days
          : config.thresholds.debt_aging_stale_days;
        if (age > limit) agingDebt.push(d);
      }

      // Decisions in period
      const decisions = db.prepare(`
        SELECT id, title, made_by, created_at FROM decisions WHERE created_at >= ? ORDER BY created_at DESC
      `).all(sinceDate) as { id: string; title: string; made_by: string | null; created_at: string }[];

      // Coverage gaps
      const specsNoAC = (db.prepare(`
        SELECT COUNT(*) as n FROM feature_specs
        WHERE status IN ('draft','active') AND (acceptance_criteria IS NULL OR acceptance_criteria = '[]')
      `).get() as { n: number }).n;

      const tasksNoSpec = (db.prepare(`
        SELECT COUNT(*) as n FROM tasks WHERE feature_spec_id IS NULL AND status != 'done'
      `).get() as { n: number }).n;

      const featuresNoSpec = 0; // placeholder

      // Agent activity
      const artifacts = db.prepare(`
        SELECT agent, COUNT(*) as sessions FROM artifacts WHERE created_at >= ? GROUP BY agent
      `).all(sinceDate) as { agent: string; sessions: number }[];

      if (options.format === 'json') {
        console.log(JSON.stringify({
          period: `${days}d`,
          currentScore,
          trend,
          scoreHistory: scores,
          debt: { total: debtRows.length, byCategory: debtByCat, bySeverity: debtBySev, aging: agingDebt.length },
          decisions: decisions.length,
          coverageGaps: { specsNoAC, tasksNoSpec },
          agentActivity: artifacts,
        }, null, 2));
        return;
      }

      const isMarkdown = options.format === 'markdown';
      const h1 = (s: string) => isMarkdown ? `# ${s}` : `\n${'═'.repeat(60)}\n  ${s}\n${'═'.repeat(60)}`;
      const h2 = (s: string) => isMarkdown ? `## ${s}` : `\n── ${s} ──`;
      const li = (s: string) => isMarkdown ? `- ${s}` : `  • ${s}`;
      const bold = (s: string) => isMarkdown ? `**${s}**` : s.toUpperCase();

      const lines: string[] = [
        h1(`Governance Report — ${config.project.name}`),
        `Period: Last ${days} days | Generated: ${formatDate(new Date().toISOString())}`,
        '',
        h2('Health Score'),
        `${bold('Current score')}: ${currentScore}/100`,
        `${bold('Trend')}: ${trend}`,
        scores.length > 0 ? `${bold('Checks in period')}: ${scores.length}` : 'No governance checks run in this period.',
        '',
        h2('Technical Debt Summary'),
        `${bold('Total open debt')}: ${debtRows.length}`,
        ...Object.entries(debtBySev).map(([sev, n]) => li(`${sev}: ${n}`)),
      ];

      if (agingDebt.length > 0) {
        lines.push('', `${bold('Aging debt')} (over threshold — ${agingDebt.length} items):`);
        agingDebt.slice(0, 10).forEach(d => {
          lines.push(li(`[${d.severity}] ${d.title} — ${daysSince(d.created_at)} days old`));
        });
      }

      lines.push('', h2('By Category'));
      Object.entries(debtByCat)
        .sort(([, a], [, b]) => b - a)
        .forEach(([cat, n]) => lines.push(li(`${cat}: ${n}`)));

      lines.push('', h2(`Decisions (last ${days}d)`));
      if (decisions.length === 0) {
        lines.push('No decisions recorded in this period.');
      } else {
        decisions.forEach(d => lines.push(li(`${d.title}${d.made_by ? ` (${d.made_by})` : ''} — ${formatDate(d.created_at)}`)));
      }

      lines.push('', h2('Coverage Gaps'));
      lines.push(li(`Active specs without acceptance criteria: ${specsNoAC}`));
      lines.push(li(`Open tasks not linked to a spec: ${tasksNoSpec}`));

      lines.push('', h2('Agent Activity'));
      if (artifacts.length === 0) {
        lines.push('No ingest sessions recorded in this period.');
      } else {
        artifacts.forEach(a => lines.push(li(`${a.agent}: ${a.sessions} session(s)`)));
      }

      console.log(lines.join('\n'));
      console.log('');
    });
}
