import { Command } from 'commander';
import { initDb } from '../db/connection';
import { runCheck } from '../engine/check';
import { requireSigilInit, formatTable, formatDate } from '../utils/format';
import { CheckIssue } from '../types';

function renderScore(score: number): string {
  if (score >= 90) return `${score}/100 ✓ (excellent)`;
  if (score >= 75) return `${score}/100 (good)`;
  if (score >= 60) return `${score}/100 (needs attention)`;
  if (score >= 40) return `${score}/100 ⚠ (concerning)`;
  return `${score}/100 ✗ (critical)`;
}

function issueIcon(type: CheckIssue['type']): string {
  switch (type) {
    case 'violation': return '✗';
    case 'warning':   return '⚠';
    case 'info':      return 'ℹ';
  }
}

export function registerCheck(program: Command): void {
  program
    .command('check')
    .description('Run governance audit and calculate health score')
    .option('--format <fmt>', 'Output format: table (default), json, markdown')
    .option('--quiet', 'Only print score')
    .action((options: { format?: string; quiet?: boolean }) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      console.log('Running governance check...\n');
      const result = runCheck(db, config);

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (options.format === 'markdown') {
        console.log(`# Governance Report\n`);
        console.log(`**Score**: ${result.score}/100  `);
        console.log(`**Checked**: ${formatDate(result.checkedAt)}  `);
        console.log(`**Violations**: ${result.violations} | **Warnings**: ${result.warnings} | **Infos**: ${result.infos}\n`);

        if (result.issues.length > 0) {
          console.log('## Issues\n');
          for (const issue of result.issues) {
            const loc = issue.file ? ` \`${issue.file}${issue.line ? `:${issue.line}` : ''}\`` : '';
            console.log(`- **[${issue.type.toUpperCase()}]** [${issue.category}]${loc}: ${issue.message}`);
          }
        } else {
          console.log('*No issues found.*');
        }
        return;
      }

      // Default: table output
      console.log(`Governance Score: ${renderScore(result.score)}`);
      console.log(`Checked: ${formatDate(result.checkedAt)}\n`);
      console.log(`  Violations: ${result.violations}  Warnings: ${result.warnings}  Infos: ${result.infos}\n`);

      if (options.quiet) return;

      if (result.issues.length === 0) {
        console.log('No issues found. ✓');
        return;
      }

      // Group by type
      const byType: Record<string, CheckIssue[]> = { violation: [], warning: [], info: [] };
      for (const issue of result.issues) {
        byType[issue.type].push(issue);
      }

      for (const [type, issues] of Object.entries(byType)) {
        if (issues.length === 0) continue;
        const icon = issueIcon(type as CheckIssue['type']);
        console.log(`${icon} ${type.toUpperCase()}S (${issues.length})`);
        console.log(formatTable(
          ['Category', 'Message', 'File'],
          issues.map(i => [
            i.category,
            i.message.slice(0, 60),
            i.file ? `${i.file}${i.line ? `:${i.line}` : ''}`.slice(0, 35) : '-',
          ])
        ));
        console.log('');
      }

      if (result.violations > 0) {
        console.log('Address violations first — they directly impact code quality and architecture.');
      }
    });
}
