import { Command } from 'commander';
import { initDb } from '../db/connection';
import { requireSigilInit, formatDate, printKeyValue, printSection } from '../utils/format';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show project health overview')
    .action(() => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      // Project info
      const project = db.prepare('SELECT * FROM projects LIMIT 1').get() as { name: string; type: string; description: string } | undefined;
      const lastIngest = (db.prepare("SELECT value FROM meta WHERE key = 'last_ingest_timestamp'").get() as { value: string } | undefined)?.value ?? '';
      const lastScore = (db.prepare("SELECT value FROM meta WHERE key = 'last_check_score'").get() as { value: string } | undefined)?.value ?? '';

      console.log('\n╔══════════════════════════════════════════════════╗');
      console.log('║              SIGIL PROJECT STATUS                ║');
      console.log('╚══════════════════════════════════════════════════╝\n');

      printKeyValue([
        ['Project', `${config.project.name} (${config.project.type})`],
        ['Last ingest', lastIngest ? formatDate(lastIngest) : 'never'],
        ['Health score', lastScore ? `${lastScore}/100` : 'not checked (run `sigil check`)'],
      ]);

      // Rules / governance counts
      const ruleCount = (db.prepare('SELECT COUNT(*) as n FROM architecture_rules WHERE enabled=1').get() as { n: number }).n;
      const ruleDisabled = (db.prepare('SELECT COUNT(*) as n FROM architecture_rules WHERE enabled=0').get() as { n: number }).n;
      const constraintCount = (db.prepare('SELECT COUNT(*) as n FROM constraints WHERE enabled=1').get() as { n: number }).n;
      const antiPatternCount = (db.prepare('SELECT COUNT(*) as n FROM anti_patterns WHERE enabled=1').get() as { n: number }).n;
      const patternCount = (db.prepare('SELECT COUNT(*) as n FROM code_patterns').get() as { n: number }).n;

      printSection('Governance', [
        `  Rules:         ${ruleCount} active${ruleDisabled > 0 ? `, ${ruleDisabled} disabled` : ''}`,
        `  Constraints:   ${constraintCount}`,
        `  Anti-patterns: ${antiPatternCount}`,
        `  Patterns:      ${patternCount}`,
      ].join('\n'));

      // Task breakdown
      const taskRows = db.prepare(`
        SELECT status, COUNT(*) as n FROM tasks GROUP BY status
      `).all() as { status: string; n: number }[];
      const taskMap: Record<string, number> = {};
      for (const r of taskRows) taskMap[r.status] = r.n;

      const totalTasks = Object.values(taskMap).reduce((a, b) => a + b, 0);
      printSection('Tasks', [
        `  Total:       ${totalTasks}`,
        `  Todo:        ${taskMap['todo'] ?? 0}`,
        `  In Progress: ${taskMap['in_progress'] ?? 0}`,
        `  Blocked:     ${taskMap['blocked'] ?? 0}`,
        `  Done:        ${taskMap['done'] ?? 0}`,
      ].join('\n'));

      // Debt breakdown
      const debtRows = db.prepare(`
        SELECT severity, COUNT(*) as n FROM technical_debt WHERE status != 'resolved' GROUP BY severity
      `).all() as { severity: string; n: number }[];
      const debtMap: Record<string, number> = {};
      for (const r of debtRows) debtMap[r.severity] = r.n;

      const totalDebt = Object.values(debtMap).reduce((a, b) => a + b, 0);
      if (totalDebt > 0) {
        printSection('Open Technical Debt', [
          `  Total:    ${totalDebt}`,
          `  Critical: ${debtMap['critical'] ?? 0}`,
          `  High:     ${debtMap['high'] ?? 0}`,
          `  Medium:   ${debtMap['medium'] ?? 0}`,
          `  Low:      ${debtMap['low'] ?? 0}`,
        ].join('\n'));
      } else {
        printSection('Technical Debt', '  No open debt. ✓');
      }

      // Active specs
      const specCount = (db.prepare("SELECT COUNT(*) as n FROM feature_specs WHERE status IN ('draft','active')").get() as { n: number }).n;
      const decisionCount = (db.prepare('SELECT COUNT(*) as n FROM decisions').get() as { n: number }).n;

      printSection('Documentation', [
        `  Active specs: ${specCount}`,
        `  Decisions:    ${decisionCount}`,
      ].join('\n'));

      console.log('\nRun `sigil check` for a detailed governance audit.');
      console.log('');
    });
}
