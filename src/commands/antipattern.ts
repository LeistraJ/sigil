import { Command } from 'commander';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db/connection';
import { regenerateContextFiles } from '../engine/regenerate';
import { requireSigilInit, formatTable, nowIso, truncate, parseJSON, stringifyJSON } from '../utils/format';
import { AntiPatternRow } from '../types';

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

export function registerAntiPattern(program: Command): void {
  const ap = program
    .command('antipattern')
    .description('Manage anti-patterns');

  ap
    .command('list')
    .description('List all anti-patterns')
    .option('--active', 'Show only enabled')
    .action((options: { active?: boolean }) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      let query = 'SELECT * FROM anti_patterns';
      if (options.active) query += ' WHERE enabled = 1';
      query += ' ORDER BY severity DESC, name ASC';

      const rows = db.prepare(query).all() as AntiPatternRow[];

      if (rows.length === 0) { console.log('No anti-patterns found.'); return; }

      console.log(formatTable(
        ['ID', 'Name', 'Severity', 'Scope', 'Enabled'],
        rows.map(r => [
          r.id.slice(0, 8),
          truncate(r.name, 45),
          r.severity,
          r.scope,
          r.enabled ? 'yes' : 'no',
        ])
      ));
      console.log(`\n${rows.length} anti-pattern(s).`);
    });

  ap
    .command('add')
    .description('Add a custom anti-pattern')
    .action(async () => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      try {
        const name = (await ask(rl, 'Name: ')).trim();
        if (!name) { console.error('Name required.'); rl.close(); process.exit(1); }

        const description = (await ask(rl, 'Description: ')).trim();
        const why_harmful = (await ask(rl, 'Why is this harmful? ')).trim();

        console.log('Detection signals (comma-separated):');
        const signalsInput = (await ask(rl, '> ')).trim();
        const detection_signals = signalsInput.split(',').map(s => s.trim()).filter(Boolean);

        const resolution = (await ask(rl, 'Resolution/fix: ')).trim();

        console.log('Severity: 1) warning  2) violation');
        const sevInput = (await ask(rl, 'Severity (1-2, default: 1): ')).trim();
        const severity = sevInput === '2' ? 'violation' : 'warning';

        rl.close();

        const id = uuidv4();
        const now = nowIso();
        db.prepare(`
          INSERT INTO anti_patterns (id, name, description, why_harmful, detection_signals, resolution, severity, scope, enabled, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'all', 1, 'user', ?)
        `).run(id, name, description, why_harmful, stringifyJSON(detection_signals), resolution, severity, now);

        regenerateContextFiles(db, config);
        console.log(`Anti-pattern added: ${id.slice(0, 8)} — "${name}"`);
      } catch (err) {
        rl.close();
        console.error('Failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  ap
    .command('show <id>')
    .description('Show full anti-pattern details')
    .action((id: string) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare('SELECT * FROM anti_patterns WHERE id LIKE ? LIMIT 1')
        .get(id + '%') as AntiPatternRow | undefined;

      if (!row) { console.error(`Anti-pattern not found: ${id}`); process.exit(1); }

      const signals = parseJSON<string[]>(row.detection_signals, []);

      console.log(`
ID:       ${row.id}
Name:     ${row.name}
Severity: ${row.severity}
Scope:    ${row.scope}
Enabled:  ${row.enabled ? 'yes' : 'no'}

Description:
  ${row.description}

Why Harmful:
  ${row.why_harmful}

Detection Signals:
${signals.map(s => `  - ${s}`).join('\n')}

Resolution:
  ${row.resolution}

Created: ${row.created_at}
`);
    });
}
