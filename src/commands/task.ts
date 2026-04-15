import { Command } from 'commander';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db/connection';
import { regenerateContextFiles } from '../engine/regenerate';
import { requireSigilInit, formatTable, nowIso, truncate } from '../utils/format';
import { TaskRow, TaskStatus, TaskPriority } from '../types';

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

export function registerTask(program: Command): void {
  const task = program
    .command('task')
    .description('Manage tasks');

  task
    .command('list')
    .description('List tasks')
    .option('--status <status>', 'Filter: todo, in_progress, blocked, done')
    .option('--priority <priority>', 'Filter: low, medium, high, critical')
    .option('--all', 'Include completed tasks')
    .action((options: { status?: string; priority?: string; all?: boolean }) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const conditions: string[] = [];
      const params: string[] = [];

      if (options.status) {
        conditions.push('t.status = ?');
        params.push(options.status);
      } else if (!options.all) {
        conditions.push("t.status != 'done'");
      }

      if (options.priority) {
        conditions.push('t.priority = ?');
        params.push(options.priority);
      }

      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const rows = db.prepare(`
        SELECT t.*, fs.title as spec_title FROM tasks t
        LEFT JOIN feature_specs fs ON t.feature_spec_id = fs.id
        ${where}
        ORDER BY CASE t.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END, t.created_at ASC
      `).all(...params) as (TaskRow & { spec_title?: string })[];

      if (rows.length === 0) { console.log('No tasks found.'); return; }

      console.log(formatTable(
        ['ID', 'Title', 'Status', 'Priority', 'Spec', 'Agent'],
        rows.map(r => [
          r.id.slice(0, 8),
          truncate(r.title, 40),
          r.status,
          r.priority,
          truncate(r.spec_title ?? '-', 20),
          r.assigned_agent ?? '-',
        ])
      ));
      console.log(`\n${rows.length} task(s).`);
    });

  task
    .command('add')
    .description('Add a task')
    .action(async () => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      try {
        const title = (await ask(rl, 'Title: ')).trim();
        if (!title) { console.error('Title required.'); rl.close(); process.exit(1); }

        const description = (await ask(rl, 'Description (optional): ')).trim();

        console.log('Priority: 1) low  2) medium  3) high  4) critical  (default: 2)');
        const prioInput = (await ask(rl, 'Priority: ')).trim();
        const prioMap: Record<string, TaskPriority> = { '1': 'low', '2': 'medium', '3': 'high', '4': 'critical' };
        const priority: TaskPriority = prioMap[prioInput] ?? 'medium';

        // List specs for linking
        const specs = db.prepare("SELECT id, title FROM feature_specs WHERE status IN ('draft','active') LIMIT 10").all() as { id: string; title: string }[];
        let feature_spec_id: string | null = null;

        if (specs.length > 0) {
          console.log('\nLink to a feature spec? (enter number or leave blank)');
          specs.forEach((s, i) => console.log(`  ${i + 1}) ${s.title}`));
          const specInput = (await ask(rl, 'Spec: ')).trim();
          const specIdx = parseInt(specInput, 10);
          if (specIdx >= 1 && specIdx <= specs.length) {
            feature_spec_id = specs[specIdx - 1].id;
          }
        }

        const agentInput = (await ask(rl, 'Assign to agent (claude/gemini/human, optional): ')).trim();

        rl.close();

        const id = uuidv4();
        const now = nowIso();
        db.prepare(`
          INSERT INTO tasks (id, title, description, status, priority, feature_spec_id, assigned_agent, created_at, updated_at)
          VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?)
        `).run(id, title, description || null, priority, feature_spec_id, agentInput || null, now, now);

        regenerateContextFiles(db, config);
        console.log(`Task added: ${id.slice(0, 8)} — "${title}"`);
      } catch (err) {
        rl.close();
        console.error('Failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  task
    .command('update <id>')
    .description('Update task status, priority, or agent')
    .option('--status <status>', 'New status: todo, in_progress, blocked, done')
    .option('--priority <priority>', 'New priority: low, medium, high, critical')
    .option('--agent <agent>', 'Assign to agent')
    .action((id: string, options: { status?: string; priority?: string; agent?: string }) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare('SELECT * FROM tasks WHERE id LIKE ? LIMIT 1')
        .get(id + '%') as TaskRow | undefined;

      if (!row) { console.error(`Task not found: ${id}`); process.exit(1); }

      const updates: string[] = [];
      const params: (string)[] = [];

      if (options.status) { updates.push('status = ?'); params.push(options.status); }
      if (options.priority) { updates.push('priority = ?'); params.push(options.priority); }
      if (options.agent) { updates.push('assigned_agent = ?'); params.push(options.agent); }

      if (updates.length === 0) { console.log('Nothing to update.'); return; }

      updates.push('updated_at = ?');
      params.push(nowIso());
      params.push(row.id);

      db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      regenerateContextFiles(db, config);
      console.log(`Task "${row.title}" updated.`);
    });

  task
    .command('show <id>')
    .description('Show full task details')
    .action((id: string) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const row = db.prepare(`
        SELECT t.*, fs.title as spec_title FROM tasks t
        LEFT JOIN feature_specs fs ON t.feature_spec_id = fs.id
        WHERE t.id LIKE ? LIMIT 1
      `).get(id + '%') as (TaskRow & { spec_title?: string }) | undefined;

      if (!row) { console.error(`Task not found: ${id}`); process.exit(1); }

      console.log(`
ID:       ${row.id}
Title:    ${row.title}
Status:   ${row.status}
Priority: ${row.priority}
Spec:     ${row.spec_title ?? '-'}
Agent:    ${row.assigned_agent ?? '-'}

${row.description ? `Description:\n  ${row.description}\n` : ''}
Created: ${row.created_at}
Updated: ${row.updated_at}
`);
    });
}
