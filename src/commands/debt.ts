import { Command } from 'commander';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db/connection';
import { regenerateContextFiles } from '../engine/regenerate';
import { requireSigilInit, formatTable, nowIso, truncate, daysSince } from '../utils/format';
import { TechnicalDebtRow, DebtCategory, DebtSeverity } from '../types';

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

const DEBT_CATEGORIES: DebtCategory[] = [
  'duplication', 'boundary_violation', 'missing_tests', 'temporary_hack',
  'oversized_file', 'unclear_abstraction', 'inconsistent_naming',
  'performance_compromise', 'missing_error_handling', 'stale_dependency',
];

export function registerDebt(program: Command): void {
  const debt = program
    .command('debt')
    .description('Manage technical debt');

  debt
    .command('list')
    .description('List technical debt')
    .option('--status <status>', 'Filter: open, acknowledged, in_progress, resolved')
    .option('--severity <severity>', 'Filter: low, medium, high, critical')
    .option('--category <category>', 'Filter by category')
    .action((options: { status?: string; severity?: string; category?: string }) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const conditions: string[] = [];
      const params: string[] = [];

      if (options.status) {
        conditions.push('status = ?');
        params.push(options.status);
      } else {
        conditions.push("status != 'resolved'");
      }

      if (options.severity) {
        conditions.push('severity = ?');
        params.push(options.severity);
      }

      if (options.category) {
        conditions.push('category = ?');
        params.push(options.category);
      }

      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const rows = db.prepare(`
        SELECT * FROM technical_debt ${where}
        ORDER BY CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END, created_at ASC
      `).all(...params) as TechnicalDebtRow[];

      if (rows.length === 0) { console.log('No debt found.'); return; }

      console.log(formatTable(
        ['ID', 'Title', 'Severity', 'Category', 'Status', 'Age', 'File'],
        rows.map(r => [
          r.id.slice(0, 8),
          truncate(r.title, 35),
          r.severity,
          r.category,
          r.status,
          `${daysSince(r.created_at)}d`,
          truncate(r.file ?? '-', 25),
        ])
      ));
      console.log(`\n${rows.length} debt item(s).`);
    });

  debt
    .command('add')
    .description('Add a technical debt entry')
    .action(async () => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      try {
        const title = (await ask(rl, 'Title: ')).trim();
        if (!title) { console.error('Title required.'); rl.close(); process.exit(1); }

        console.log('\nCategory:');
        DEBT_CATEGORIES.forEach((c, i) => console.log(`  ${i + 1}) ${c}`));
        const catInput = (await ask(rl, 'Category (1-10): ')).trim();
        const catIdx = parseInt(catInput, 10);
        const category: DebtCategory = (catIdx >= 1 && catIdx <= DEBT_CATEGORIES.length)
          ? DEBT_CATEGORIES[catIdx - 1]
          : 'temporary_hack';

        const description = (await ask(rl, 'Description: ')).trim();
        const file = (await ask(rl, 'File path (optional): ')).trim();
        const line_range = file ? (await ask(rl, 'Line range (e.g. 42-65, optional): ')).trim() : '';

        console.log('\nSeverity: 1) low  2) medium  3) high  4) critical  (default: 2)');
        const sevInput = (await ask(rl, 'Severity: ')).trim();
        const sevMap: Record<string, DebtSeverity> = { '1': 'low', '2': 'medium', '3': 'high', '4': 'critical' };
        const severity: DebtSeverity = sevMap[sevInput] ?? 'medium';

        console.log('Effort: 1) small  2) medium  3) large  (optional)');
        const effortInput = (await ask(rl, 'Effort: ')).trim();
        const effortMap: Record<string, string> = { '1': 'small', '2': 'medium', '3': 'large' };
        const estimated_effort = effortMap[effortInput] ?? null;

        const added_by = (await ask(rl, 'Added by (agent/human name, optional): ')).trim();

        rl.close();

        const id = uuidv4();
        const now = nowIso();
        db.prepare(`
          INSERT INTO technical_debt (id, title, category, description, file, line_range, severity, status, added_by, estimated_effort, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
        `).run(
          id, title, category, description,
          file || null, line_range || null, severity,
          added_by || 'unknown', estimated_effort, now, now
        );

        regenerateContextFiles(db, config);
        console.log(`Debt added: ${id.slice(0, 8)} — "${title}" [${severity}]`);
      } catch (err) {
        rl.close();
        console.error('Failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  debt
    .command('update <id>')
    .description('Update debt status or resolution')
    .option('--status <status>', 'New status: open, acknowledged, in_progress, resolved')
    .option('--notes <notes>', 'Resolution notes')
    .action((id: string, options: { status?: string; notes?: string }) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare('SELECT * FROM technical_debt WHERE id LIKE ? LIMIT 1')
        .get(id + '%') as TechnicalDebtRow | undefined;

      if (!row) { console.error(`Debt not found: ${id}`); process.exit(1); }

      const updates: string[] = [];
      const params: (string | null)[] = [];

      if (options.status) {
        updates.push('status = ?');
        params.push(options.status);
        if (options.status === 'resolved') {
          updates.push('resolved_at = ?');
          params.push(nowIso());
        }
      }
      if (options.notes) {
        updates.push('resolution_notes = ?');
        params.push(options.notes);
      }

      if (updates.length === 0) { console.log('Nothing to update.'); return; }

      updates.push('updated_at = ?');
      params.push(nowIso());
      params.push(row.id);

      db.prepare(`UPDATE technical_debt SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      regenerateContextFiles(db, config);
      console.log(`Debt "${row.title}" updated.`);
    });

  debt
    .command('show <id>')
    .description('Show full debt entry details')
    .action((id: string) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare('SELECT * FROM technical_debt WHERE id LIKE ? LIMIT 1')
        .get(id + '%') as TechnicalDebtRow | undefined;

      if (!row) { console.error(`Debt not found: ${id}`); process.exit(1); }

      console.log(`
ID:       ${row.id}
Title:    ${row.title}
Category: ${row.category}
Severity: ${row.severity}
Status:   ${row.status}
Age:      ${daysSince(row.created_at)} days
${row.file ? `File:     ${row.file}${row.line_range ? `:${row.line_range}` : ''}` : ''}
${row.estimated_effort ? `Effort:   ${row.estimated_effort}` : ''}
${row.added_by ? `Added by: ${row.added_by}` : ''}

Description:
  ${row.description}
${row.resolution_notes ? `\nResolution notes:\n  ${row.resolution_notes}` : ''}
Created: ${row.created_at}
`);
    });
}
