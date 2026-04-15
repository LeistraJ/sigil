import { DB } from '../connection';
import { v4 as uuidv4 } from 'uuid';

import { RuleSeed } from '../../types';
import { nowIso } from '../../utils/format';

const LIBRARY_RULES: RuleSeed[] = [
  {
    title: 'Public API surface stability',
    description: 'Changes to public exports must be deliberate and versioned. Do not accidentally break consumers.',
    check: 'Public exports changed without version bump or changelog entry consideration',
    severity: 'warning',
    scope: 'library',
  },
  {
    title: 'No framework coupling',
    description: 'Library must not import framework-specific modules unless declared as peer dependencies.',
    check: 'Framework-specific imports without corresponding peer dependency declaration',
    severity: 'violation',
    scope: 'library',
  },
  {
    title: 'Minimal runtime dependencies',
    description: 'Every new runtime dependency must be justified. Prefer zero-dependency implementations where feasible.',
    check: 'New dependency added to package.json without documented justification',
    severity: 'info',
    scope: 'library',
  },
  {
    title: 'Backward-compatible changes',
    description: 'Existing public function signatures must not change without a major version bump.',
    check: 'Public function parameter or return type changed in non-major release',
    severity: 'violation',
    scope: 'library',
  },
  {
    title: 'Documented public API',
    description: 'Every public export must have JSDoc or equivalent documentation.',
    check: 'Public export lacks JSDoc or docstring',
    severity: 'warning',
    scope: 'library',
  },
  {
    title: 'Tree-shakeable exports',
    description: 'Use named exports. Avoid default exports of large objects that prevent tree-shaking.',
    check: 'Default export of large object or namespace instead of individual named exports',
    severity: 'warning',
    scope: 'library',
  },
];

export function seedLibrary(db: DB): void {
  const now = nowIso();

  const insertRule = db.prepare(`
    INSERT INTO architecture_rules (id, title, description, "check", threshold, severity, scope, enabled, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'default', ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const rule of LIBRARY_RULES) {
      insertRule.run(
        uuidv4(), rule.title, rule.description, rule.check,
        rule.threshold ?? null, rule.severity, rule.scope ?? 'library', now, now
      );
    }
      db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
