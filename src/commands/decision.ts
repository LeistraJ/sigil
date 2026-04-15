import { Command } from 'commander';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db/connection';
import { regenerateContextFiles } from '../engine/regenerate';
import { requireSigilInit, formatTable, nowIso, truncate, parseJSON, stringifyJSON } from '../utils/format';
import { DecisionRow } from '../types';

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

export function registerDecision(program: Command): void {
  const decision = program
    .command('decision')
    .description('Manage architectural decisions');

  decision
    .command('list')
    .description('List decisions')
    .option('--limit <n>', 'Max number to show', '20')
    .action((options: { limit?: string }) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);
      const limit = parseInt(options.limit ?? '20', 10);

      const rows = db.prepare('SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?').all(limit) as DecisionRow[];

      if (rows.length === 0) { console.log('No decisions found.'); return; }

      console.log(formatTable(
        ['ID', 'Title', 'Made By', 'Date'],
        rows.map(r => [
          r.id.slice(0, 8),
          truncate(r.title, 45),
          r.made_by ?? '-',
          r.created_at.slice(0, 10),
        ])
      ));
      console.log(`\n${rows.length} decision(s).`);
    });

  decision
    .command('add')
    .description('Record an architectural decision')
    .action(async () => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      try {
        const title = (await ask(rl, 'Title: ')).trim();
        if (!title) { console.error('Title required.'); rl.close(); process.exit(1); }

        const description = (await ask(rl, 'Description (what was decided): ')).trim();
        const rationale = (await ask(rl, 'Rationale (why): ')).trim();

        console.log('Alternatives considered (comma-separated, optional):');
        const altsInput = (await ask(rl, '> ')).trim();
        const alternatives = altsInput ? altsInput.split(',').map(s => s.trim()).filter(Boolean) : [];

        const made_by = (await ask(rl, 'Made by (agent/human name, optional): ')).trim();

        rl.close();

        const id = uuidv4();
        const now = nowIso();
        db.prepare(`
          INSERT INTO decisions (id, title, description, rationale, alternatives_considered, made_by, related_spec_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, title, description, rationale, stringifyJSON(alternatives), made_by || null, null, now);

        regenerateContextFiles(db, config);
        console.log(`Decision recorded: ${id.slice(0, 8)} — "${title}"`);
      } catch (err) {
        rl.close();
        console.error('Failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  decision
    .command('show <id>')
    .description('Show full decision details')
    .action((id: string) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare('SELECT * FROM decisions WHERE id LIKE ? LIMIT 1')
        .get(id + '%') as DecisionRow | undefined;

      if (!row) { console.error(`Decision not found: ${id}`); process.exit(1); }

      const alternatives = parseJSON<string[]>(row.alternatives_considered, []);

      console.log(`
ID:    ${row.id}
Title: ${row.title}
Date:  ${row.created_at}
${row.made_by ? `Made by: ${row.made_by}\n` : ''}
Description:
  ${row.description}

Rationale:
  ${row.rationale}
${alternatives.length > 0 ? `\nAlternatives considered:\n${alternatives.map(a => `  - ${a}`).join('\n')}` : ''}
`);
    });
}
