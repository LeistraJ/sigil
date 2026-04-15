import { DB } from '../connection';
import { v4 as uuidv4 } from 'uuid';

import { RuleSeed } from '../../types';
import { nowIso } from '../../utils/format';
import { seedFrontend } from './frontend';
import { seedBackend } from './backend';

const FULLSTACK_RULES: RuleSeed[] = [
  {
    title: 'Shared types across boundary',
    description: 'Frontend and backend must share type definitions for API contracts. Do not define the same shape twice.',
    check: 'Same data shape defined independently in both frontend and backend code',
    severity: 'warning',
    scope: 'fullstack',
  },
  {
    title: 'API contract alignment',
    description: 'Frontend expectations must match backend response shapes exactly.',
    check: 'Frontend expects fields not present in backend response or vice versa',
    severity: 'violation',
    scope: 'fullstack',
  },
  {
    title: 'No client-side secrets',
    description: 'Backend secrets, internal URLs, and admin endpoints must never be referenced in client-facing code.',
    check: 'Server secrets, internal URLs, or admin endpoints found in client bundle or client source',
    severity: 'violation',
    scope: 'fullstack',
  },
];

export function seedFullstack(db: DB): void {
  const now = nowIso();

  seedFrontend(db);
  seedBackend(db);

  const insertRule = db.prepare(`
    INSERT INTO architecture_rules (id, title, description, "check", threshold, severity, scope, enabled, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'default', ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const rule of FULLSTACK_RULES) {
      insertRule.run(
        uuidv4(), rule.title, rule.description, rule.check,
        rule.threshold ?? null, rule.severity, rule.scope ?? 'fullstack', now, now
      );
    }
      db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
