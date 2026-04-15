import { Command } from 'commander';
import { initDb } from '../db/connection';
import { requireSigilInit, formatTable, truncate } from '../utils/format';

const ALLOWED_TABLES = new Set([
  'architecture_rules', 'rules',
  'constraints',
  'anti_patterns', 'antipatterns',
  'code_patterns', 'patterns',
  'feature_specs', 'specs',
  'tasks',
  'decisions',
  'technical_debt', 'debt',
  'artifacts',
  'events',
  'exports',
  'meta',
]);

const TABLE_ALIASES: Record<string, string> = {
  rules: 'architecture_rules',
  antipatterns: 'anti_patterns',
  patterns: 'code_patterns',
  specs: 'feature_specs',
  debt: 'technical_debt',
};

export function registerQuery(program: Command): void {
  program
    .command('query <table>')
    .description('Query a Sigil table (rules, tasks, debt, decisions, artifacts, ...)')
    .option('--active', 'Filter enabled=1 / status=active')
    .option('--status <status>', 'Filter by status')
    .option('--severity <severity>', 'Filter by severity')
    .option('--limit <n>', 'Max rows to return', '20')
    .option('--format <fmt>', 'Output format: table (default) or json')
    .action((table: string, options: {
      active?: boolean;
      status?: string;
      severity?: string;
      limit?: string;
      format?: string;
    }) => {
      const { dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const rawTable = table.toLowerCase();
      if (!ALLOWED_TABLES.has(rawTable)) {
        console.error(`Unknown table: "${table}". Allowed: ${[...ALLOWED_TABLES].filter(t => !TABLE_ALIASES[t]).join(', ')}`);
        process.exit(1);
      }

      const actualTable = TABLE_ALIASES[rawTable] ?? rawTable;
      const limit = parseInt(options.limit ?? '20', 10);
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (options.active) {
        // Different tables have different "active" columns
        if (['architecture_rules', 'constraints', 'anti_patterns', 'code_patterns'].includes(actualTable)) {
          conditions.push('enabled = 1');
        } else if (['feature_specs'].includes(actualTable)) {
          conditions.push("status IN ('draft', 'active')");
        } else if (['technical_debt', 'tasks'].includes(actualTable)) {
          conditions.push("status != 'done'");
        }
      }

      if (options.status) {
        conditions.push('status = ?');
        params.push(options.status);
      }

      if (options.severity) {
        conditions.push('severity = ?');
        params.push(options.severity);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit);

      let rows: Record<string, unknown>[];
      try {
        rows = db.prepare(`SELECT * FROM "${actualTable}" ${where} ORDER BY created_at DESC LIMIT ?`).all(...params) as Record<string, unknown>[];
      } catch (err) {
        console.error('Query failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      if (rows.length === 0) {
        console.log('No results.');
        return;
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }

      // Table output — use first row's keys as headers
      const headers = Object.keys(rows[0]);
      const tableRows = rows.map(r =>
        headers.map(h => {
          const val = r[h];
          if (val === null || val === undefined) return '-';
          const str = String(val);
          // Truncate long columns (JSON blobs etc)
          return truncate(str, 40);
        })
      );

      console.log(formatTable(headers, tableRows));
      console.log(`\n${rows.length} row(s).`);
    });
}
