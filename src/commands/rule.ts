import { Command } from 'commander';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db/connection';
import { regenerateContextFiles } from '../engine/regenerate';
import { requireSigilInit, formatTable, nowIso, truncate } from '../utils/format';
import { ArchitectureRuleRow, Severity, RuleScope } from '../types';

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

export function registerRule(program: Command): void {
  const rule = program
    .command('rule')
    .description('Manage architecture rules');

  // rule list
  rule
    .command('list')
    .description('List all architecture rules')
    .option('--scope <scope>', 'Filter by scope (all, frontend, backend, fullstack, library)')
    .option('--active', 'Show only enabled rules')
    .option('--quiet', 'Suppress extra output')
    .action((options: { scope?: string; active?: boolean; quiet?: boolean }) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      let query = 'SELECT * FROM architecture_rules';
      const params: (string | number)[] = [];
      const conditions: string[] = [];

      if (options.scope) {
        conditions.push('scope = ?');
        params.push(options.scope);
      }
      if (options.active) {
        conditions.push('enabled = 1');
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY scope ASC, severity DESC, title ASC';

      const rows = db.prepare(query).all(...params) as ArchitectureRuleRow[];

      if (rows.length === 0) {
        console.log('No rules found.');
        return;
      }

      console.log(formatTable(
        ['ID', 'Title', 'Severity', 'Scope', 'Enabled', 'Source'],
        rows.map(r => [
          r.id.slice(0, 8),
          truncate(r.title, 45),
          r.severity,
          r.scope,
          r.enabled ? 'yes' : 'no',
          r.source,
        ])
      ));

      if (!options.quiet) console.log(`\n${rows.length} rule(s) found.`);
    });

  // rule add
  rule
    .command('add')
    .description('Add a custom architecture rule')
    .action(async () => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      try {
        const title = (await ask(rl, 'Title: ')).trim();
        if (!title) { console.error('Title is required.'); rl.close(); process.exit(1); }

        const description = (await ask(rl, 'Description: ')).trim();
        const check = (await ask(rl, 'Check condition: ')).trim();
        const threshold = (await ask(rl, 'Threshold (optional, e.g. "300 lines"): ')).trim();

        console.log('Severity: 1) info  2) warning  3) violation');
        const sevInput = (await ask(rl, 'Severity (1-3, default: 2): ')).trim();
        const sevMap: Record<string, Severity> = { '1': 'info', '2': 'warning', '3': 'violation' };
        const severity: Severity = sevMap[sevInput] ?? 'warning';

        console.log('Scope: 1) all  2) frontend  3) backend  4) fullstack  5) library');
        const scopeInput = (await ask(rl, 'Scope (1-5, default: 1): ')).trim();
        const scopeMap: Record<string, RuleScope> = {
          '1': 'all', '2': 'frontend', '3': 'backend', '4': 'fullstack', '5': 'library',
        };
        const scope: RuleScope = scopeMap[scopeInput] ?? 'all';

        rl.close();

        const now = nowIso();
        const id = uuidv4();
        db.prepare(`
          INSERT INTO architecture_rules (id, title, description, "check", threshold, severity, scope, enabled, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'user', ?, ?)
        `).run(id, title, description, check, threshold || null, severity, scope, now, now);

        regenerateContextFiles(db, config);
        console.log(`Rule added: ${id.slice(0, 8)} — "${title}"`);
      } catch (err) {
        rl.close();
        console.error('Failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // rule disable
  rule
    .command('disable <id>')
    .description('Disable a rule by ID (or ID prefix)')
    .action((id: string) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare(`
        SELECT id, title FROM architecture_rules WHERE id LIKE ? LIMIT 1
      `).get(id + '%') as { id: string; title: string } | undefined;

      if (!row) {
        console.error(`Rule not found: ${id}`);
        process.exit(1);
      }

      db.prepare('UPDATE architecture_rules SET enabled = 0, updated_at = ? WHERE id = ?')
        .run(nowIso(), row.id);

      regenerateContextFiles(db, config);
      console.log(`Rule disabled: "${row.title}"`);
    });

  // rule enable
  rule
    .command('enable <id>')
    .description('Enable a rule by ID (or ID prefix)')
    .action((id: string) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare(`
        SELECT id, title FROM architecture_rules WHERE id LIKE ? LIMIT 1
      `).get(id + '%') as { id: string; title: string } | undefined;

      if (!row) {
        console.error(`Rule not found: ${id}`);
        process.exit(1);
      }

      db.prepare('UPDATE architecture_rules SET enabled = 1, updated_at = ? WHERE id = ?')
        .run(nowIso(), row.id);

      regenerateContextFiles(db, config);
      console.log(`Rule enabled: "${row.title}"`);
    });

  // rule show
  rule
    .command('show <id>')
    .description('Show full rule details')
    .action((id: string) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare(`
        SELECT * FROM architecture_rules WHERE id LIKE ? LIMIT 1
      `).get(id + '%') as ArchitectureRuleRow | undefined;

      if (!row) {
        console.error(`Rule not found: ${id}`);
        process.exit(1);
      }

      console.log(`
ID:          ${row.id}
Title:       ${row.title}
Severity:    ${row.severity}
Scope:       ${row.scope}
Enabled:     ${row.enabled ? 'yes' : 'no'}
Source:      ${row.source}

Description:
  ${row.description}

Check:
  ${row.check}${row.threshold ? `\n  Threshold: ${row.threshold}` : ''}

Created: ${row.created_at}
`);
    });
}
