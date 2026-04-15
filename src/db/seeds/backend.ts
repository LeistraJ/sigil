import { DB } from '../connection';
import { v4 as uuidv4 } from 'uuid';

import { RuleSeed } from '../../types';
import { nowIso } from '../../utils/format';

const BACKEND_RULES: RuleSeed[] = [
  {
    title: 'Route handlers are thin',
    description: 'Route and controller handlers should only parse input, call a service, and format the response.',
    check: 'Route/controller handler contains non-delegation logic exceeding threshold',
    threshold: '25 lines',
    severity: 'warning',
    scope: 'backend',
  },
  {
    title: 'Validation at boundaries',
    description: 'Input validation and sanitization should happen at API boundaries, not inside business logic.',
    check: 'Validation logic inside service or domain layer instead of at request boundary',
    severity: 'warning',
    scope: 'backend',
  },
  {
    title: 'Repository pattern for data access',
    description: 'Database queries must go through repository or data-access modules, not directly in services or handlers.',
    check: 'Direct database queries outside of repository or data-access modules',
    severity: 'violation',
    scope: 'backend',
  },
  {
    title: 'No silent error swallowing',
    description: 'Errors must be logged, re-thrown, or explicitly handled. Never silently caught and ignored.',
    check: 'Empty catch blocks or catch blocks that don\'t log/re-throw/return error response',
    severity: 'violation',
    scope: 'backend',
  },
  {
    title: 'No secrets in code',
    description: 'Credentials, API keys, tokens, and secrets must come from environment variables or secret management, never hardcoded.',
    check: 'Hardcoded credentials, API keys, or secret strings in source files',
    threshold: '0',
    severity: 'violation',
    scope: 'backend',
  },
  {
    title: 'Middleware for cross-cutting concerns',
    description: 'Auth, logging, rate-limiting, and CORS should be middleware, not duplicated across route handlers.',
    check: 'Cross-cutting concern implemented per-route instead of as shared middleware',
    severity: 'warning',
    scope: 'backend',
  },
  {
    title: 'Consistent API response shape',
    description: 'All API endpoints must return a consistent response envelope for both success and error cases.',
    check: 'API endpoints return differently-shaped success or error response objects',
    severity: 'warning',
    scope: 'backend',
  },
];

export function seedBackend(db: DB): void {
  const now = nowIso();

  const insertRule = db.prepare(`
    INSERT INTO architecture_rules (id, title, description, "check", threshold, severity, scope, enabled, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'default', ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const rule of BACKEND_RULES) {
      insertRule.run(
        uuidv4(), rule.title, rule.description, rule.check,
        rule.threshold ?? null, rule.severity, rule.scope ?? 'backend', now, now
      );
    }
      db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
