import { Command } from 'commander';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db/connection';
import { regenerateContextFiles } from '../engine/regenerate';
import { requireSigilInit, formatTable, nowIso, truncate } from '../utils/format';
import { ConstraintRow } from '../types';

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

export function registerConstraint(program: Command): void {
  const constraint = program
    .command('constraint')
    .description('Manage project constraints');

  constraint
    .command('list')
    .description('List all constraints')
    .option('--active', 'Show only enabled constraints')
    .action((options: { active?: boolean }) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      let query = 'SELECT * FROM constraints';
      if (options.active) query += ' WHERE enabled = 1';
      query += ' ORDER BY title ASC';

      const rows = db.prepare(query).all() as ConstraintRow[];

      if (rows.length === 0) {
        console.log('No constraints found.');
        return;
      }

      console.log(formatTable(
        ['ID', 'Title', 'Severity', 'Enabled', 'Source'],
        rows.map(r => [
          r.id.slice(0, 8),
          truncate(r.title, 50),
          r.severity,
          r.enabled ? 'yes' : 'no',
          r.source,
        ])
      ));
      console.log(`\n${rows.length} constraint(s).`);
    });

  constraint
    .command('add')
    .description('Add a custom constraint')
    .action(async () => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      try {
        const title = (await ask(rl, 'Title: ')).trim();
        if (!title) { console.error('Title required.'); rl.close(); process.exit(1); }
        const description = (await ask(rl, 'Description: ')).trim();
        rl.close();

        const id = uuidv4();
        const now = nowIso();
        db.prepare(`
          INSERT INTO constraints (id, title, description, severity, scope, enabled, source, created_at)
          VALUES (?, ?, ?, 'warning', 'all', 1, 'user', ?)
        `).run(id, title, description, now);

        regenerateContextFiles(db, config);
        console.log(`Constraint added: ${id.slice(0, 8)} — "${title}"`);
      } catch (err) {
        rl.close();
        console.error('Failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  constraint
    .command('show <id>')
    .description('Show full constraint details')
    .action((id: string) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare('SELECT * FROM constraints WHERE id LIKE ? LIMIT 1')
        .get(id + '%') as ConstraintRow | undefined;

      if (!row) { console.error(`Constraint not found: ${id}`); process.exit(1); }

      console.log(`
ID:       ${row.id}
Title:    ${row.title}
Severity: ${row.severity}
Source:   ${row.source}
Enabled:  ${row.enabled ? 'yes' : 'no'}

Description:
  ${row.description}

Created: ${row.created_at}
`);
    });
}
