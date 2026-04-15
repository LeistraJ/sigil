import { Command } from 'commander';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db/connection';
import { regenerateContextFiles } from '../engine/regenerate';
import { requireSigilInit, formatTable, nowIso, truncate, parseJSON, stringifyJSON } from '../utils/format';
import { FeatureSpecRow, SpecStatus } from '../types';

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

function parseList(input: string): string[] {
  if (!input.trim()) return [];
  return input.split('\n').map(s => s.trim()).filter(Boolean);
}

export function registerSpec(program: Command): void {
  const spec = program
    .command('spec')
    .description('Manage feature specs');

  spec
    .command('list')
    .description('List feature specs')
    .option('--status <status>', 'Filter by status (draft, active, complete, abandoned)')
    .action((options: { status?: string }) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      let query = 'SELECT fs.*, (SELECT COUNT(*) FROM tasks WHERE feature_spec_id = fs.id AND status != \'done\') as open_tasks FROM feature_specs fs';
      const params: string[] = [];
      if (options.status) {
        query += ' WHERE fs.status = ?';
        params.push(options.status);
      }
      query += ' ORDER BY fs.updated_at DESC';

      const rows = db.prepare(query).all(...params) as (FeatureSpecRow & { open_tasks: number })[];

      if (rows.length === 0) { console.log('No specs found.'); return; }

      console.log(formatTable(
        ['ID', 'Title', 'Status', 'Open Tasks', 'Updated'],
        rows.map(r => [
          r.id.slice(0, 8),
          truncate(r.title, 40),
          r.status,
          String(r.open_tasks),
          r.updated_at.slice(0, 10),
        ])
      ));
      console.log(`\n${rows.length} spec(s).`);
    });

  spec
    .command('create')
    .description('Create a feature spec interactively')
    .action(async () => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      try {
        const title = (await ask(rl, 'Title: ')).trim();
        if (!title) { console.error('Title required.'); rl.close(); process.exit(1); }

        const goal = (await ask(rl, 'Goal (what this achieves): ')).trim();
        const scope = (await ask(rl, 'Scope (what\'s included): ')).trim();

        console.log('Non-goals (one per line, blank line to finish):');
        const nonGoalsLines: string[] = [];
        while (true) {
          const line = (await ask(rl, '  > ')).trim();
          if (!line) break;
          nonGoalsLines.push(line);
        }

        console.log('Acceptance criteria (one per line, blank line to finish):');
        const criteriaLines: string[] = [];
        while (true) {
          const line = (await ask(rl, '  > ')).trim();
          if (!line) break;
          criteriaLines.push(line);
        }

        console.log('Risks (one per line, blank line to finish):');
        const riskLines: string[] = [];
        while (true) {
          const line = (await ask(rl, '  > ')).trim();
          if (!line) break;
          riskLines.push(line);
        }

        const architecture_notes = (await ask(rl, 'Architecture notes (optional): ')).trim();

        console.log('Status: 1) draft  2) active (default: 2)');
        const statusInput = (await ask(rl, 'Status: ')).trim();
        const status: SpecStatus = statusInput === '1' ? 'draft' : 'active';

        rl.close();

        const id = uuidv4();
        const now = nowIso();
        db.prepare(`
          INSERT INTO feature_specs (id, title, goal, scope, non_goals, acceptance_criteria, risks, dependencies, relevant_files, architecture_notes, constraints, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, title, goal, scope || title,
          stringifyJSON(nonGoalsLines),
          stringifyJSON(criteriaLines),
          stringifyJSON(riskLines),
          stringifyJSON([]),
          null,
          architecture_notes || null,
          stringifyJSON([]),
          status,
          now, now
        );

        regenerateContextFiles(db, config);
        console.log(`Spec created: ${id.slice(0, 8)} — "${title}"`);
      } catch (err) {
        rl.close();
        console.error('Failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  spec
    .command('show <id>')
    .description('Show full spec details')
    .action((id: string) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare('SELECT * FROM feature_specs WHERE id LIKE ? LIMIT 1')
        .get(id + '%') as FeatureSpecRow | undefined;

      if (!row) { console.error(`Spec not found: ${id}`); process.exit(1); }

      const nonGoals = parseJSON<string[]>(row.non_goals, []);
      const criteria = parseJSON<string[]>(row.acceptance_criteria, []);
      const risks = parseJSON<string[]>(row.risks, []);
      const deps = parseJSON<string[]>(row.dependencies, []);
      const constraints = parseJSON<string[]>(row.constraints, []);

      const tasks = db.prepare(`
        SELECT title, status, priority FROM tasks WHERE feature_spec_id = ? ORDER BY priority DESC
      `).all(row.id) as { title: string; status: string; priority: string }[];

      console.log(`
ID:     ${row.id}
Title:  ${row.title}
Status: ${row.status}

Goal:
  ${row.goal}

Scope:
  ${row.scope}
${nonGoals.length > 0 ? `\nNon-goals:\n${nonGoals.map(g => `  - ${g}`).join('\n')}` : ''}
${criteria.length > 0 ? `\nAcceptance Criteria:\n${criteria.map(c => `  - ${c}`).join('\n')}` : ''}
${risks.length > 0 ? `\nRisks:\n${risks.map(r => `  - ${r}`).join('\n')}` : ''}
${deps.length > 0 ? `\nDependencies:\n${deps.map(d => `  - ${d}`).join('\n')}` : ''}
${row.architecture_notes ? `\nArchitecture Notes:\n  ${row.architecture_notes}` : ''}
${constraints.length > 0 ? `\nConstraints:\n${constraints.map(c => `  - ${c}`).join('\n')}` : ''}
${tasks.length > 0 ? `\nTasks (${tasks.length}):\n${tasks.map(t => `  [${t.status}] [${t.priority}] ${t.title}`).join('\n')}` : ''}
Created: ${row.created_at}
Updated: ${row.updated_at}
`);
    });

  spec
    .command('update <id>')
    .description('Update spec status')
    .option('--status <status>', 'New status (draft, active, complete, abandoned)')
    .action((id: string, options: { status?: string }) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare('SELECT * FROM feature_specs WHERE id LIKE ? LIMIT 1')
        .get(id + '%') as FeatureSpecRow | undefined;

      if (!row) { console.error(`Spec not found: ${id}`); process.exit(1); }

      if (options.status) {
        db.prepare('UPDATE feature_specs SET status = ?, updated_at = ? WHERE id = ?')
          .run(options.status, nowIso(), row.id);
        regenerateContextFiles(db, config);
        console.log(`Spec "${row.title}" updated: status → ${options.status}`);
      } else {
        console.log('Nothing to update. Use --status to change status.');
      }
    });
}
