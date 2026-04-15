import { Command } from 'commander';
import { initDb } from '../db/connection';
import { runIngest } from '../engine/ingest';
import { requireSigilInit } from '../utils/format';

export function registerIngest(program: Command): void {
  program
    .command('ingest')
    .description('Scan recent changes and update project context')
    .option('--agent <name>', 'Agent name for attribution (e.g. claude, gemini, human)')
    .option('--quiet', 'Suppress output (for use in git hooks)')
    .action((options: { agent?: string; quiet?: boolean }) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const result = runIngest(db, config, {
        agent: options.agent,
        quiet: options.quiet,
      });

      if (result.nothingToDo) {
        if (!options.quiet) {
          console.log('Nothing to ingest — no changes since last checkpoint.');
        }
        process.exit(2);
      }

      if (!options.quiet) {
        const totalFiles = result.filesAdded.length + result.filesModified.length;
        console.log(`
Sigil ingest complete.
  Files changed:    ${totalFiles} (${result.filesAdded.length} added, ${result.filesModified.length} modified, ${result.filesDeleted.length} deleted)
  New debt found:   ${result.newDebtFound} untracked comment(s)
  Oversized files:  ${result.oversizedFiles.length}
  Context files regenerated. ✓
`);

        if (result.oversizedFiles.length > 0) {
          console.log('  Oversized files (over threshold):');
          for (const f of result.oversizedFiles) {
            console.log(`    - ${f}`);
          }
          console.log('');
        }

        if (result.newDebtFound > 0) {
          console.log(`  Run \`sigil debt add\` to track new TODO/HACK/FIXME items.`);
          console.log('');
        }
      }
    });
}
