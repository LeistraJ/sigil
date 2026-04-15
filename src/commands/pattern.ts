import { Command } from 'commander';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db/connection';
import { regenerateContextFiles } from '../engine/regenerate';
import { requireSigilInit, formatTable, nowIso, truncate, parseJSON, stringifyJSON } from '../utils/format';
import { CodePatternRow } from '../types';

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

export function registerPattern(program: Command): void {
  const pat = program
    .command('pattern')
    .description('Manage code patterns');

  pat
    .command('list')
    .description('List all code patterns')
    .action(() => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const rows = db.prepare('SELECT * FROM code_patterns ORDER BY title ASC').all() as CodePatternRow[];

      if (rows.length === 0) { console.log('No patterns found.'); return; }

      console.log(formatTable(
        ['ID', 'Title', 'Purpose', 'Source'],
        rows.map(r => [
          r.id.slice(0, 8),
          truncate(r.title, 40),
          truncate(r.purpose, 50),
          r.source,
        ])
      ));
      console.log(`\n${rows.length} pattern(s).`);
    });

  pat
    .command('add')
    .description('Add a code pattern')
    .action(async () => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      try {
        const title = (await ask(rl, 'Title: ')).trim();
        if (!title) { console.error('Title required.'); rl.close(); process.exit(1); }

        const purpose = (await ask(rl, 'Purpose: ')).trim();
        const when_to_use = (await ask(rl, 'When to use: ')).trim();
        const when_not_to_use = (await ask(rl, 'When NOT to use: ')).trim();

        console.log('Example file paths (comma-separated, optional):');
        const pathsInput = (await ask(rl, '> ')).trim();
        const example_paths = pathsInput ? pathsInput.split(',').map(s => s.trim()).filter(Boolean) : [];

        const notes = (await ask(rl, 'Notes (optional): ')).trim();

        rl.close();

        const id = uuidv4();
        const now = nowIso();
        db.prepare(`
          INSERT INTO code_patterns (id, title, purpose, when_to_use, when_not_to_use, example_paths, notes, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?)
        `).run(
          id, title, purpose, when_to_use, when_not_to_use,
          example_paths.length > 0 ? stringifyJSON(example_paths) : null,
          notes || null, now
        );

        regenerateContextFiles(db, config);
        console.log(`Pattern added: ${id.slice(0, 8)} — "${title}"`);
      } catch (err) {
        rl.close();
        console.error('Failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  pat
    .command('show <id>')
    .description('Show full pattern details')
    .action((id: string) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare('SELECT * FROM code_patterns WHERE id LIKE ? LIMIT 1')
        .get(id + '%') as CodePatternRow | undefined;

      if (!row) { console.error(`Pattern not found: ${id}`); process.exit(1); }

      const paths = parseJSON<string[]>(row.example_paths, []);

      console.log(`
ID:     ${row.id}
Title:  ${row.title}
Source: ${row.source}

Purpose:
  ${row.purpose}

When to use:
  ${row.when_to_use}

When NOT to use:
  ${row.when_not_to_use}
${paths.length > 0 ? `\nExample paths:\n${paths.map(p => `  - ${p}`).join('\n')}` : ''}
${row.notes ? `\nNotes:\n  ${row.notes}` : ''}
Created: ${row.created_at}
`);
    });
}
