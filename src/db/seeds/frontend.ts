import { DB } from '../connection';
import { v4 as uuidv4 } from 'uuid';

import { RuleSeed } from '../../types';
import { nowIso } from '../../utils/format';

const FRONTEND_RULES: RuleSeed[] = [
  {
    title: 'Component single responsibility',
    description: 'Components should either fetch data OR render UI, not both. Use container/presentational split or hooks.',
    check: 'Component handles both data fetching and complex rendering logic',
    severity: 'warning',
    scope: 'frontend',
  },
  {
    title: 'State management boundaries',
    description: 'Local state for UI-only concerns, shared/global state for data shared across components.',
    check: 'Local component state used for cross-component data or global state used for single-component UI',
    severity: 'warning',
    scope: 'frontend',
  },
  {
    title: 'No business logic in components',
    description: 'Components should not contain business logic beyond simple rendering conditionals.',
    check: 'Component contains calculations, transformations, or validation logic exceeding threshold',
    threshold: '15 lines',
    severity: 'violation',
    scope: 'frontend',
  },
  {
    title: 'API calls in service layer only',
    description: 'All HTTP/fetch/API calls must go through dedicated service or API modules, never directly in components.',
    check: 'fetch/axios/HTTP calls found outside dedicated service/api directory',
    severity: 'violation',
    scope: 'frontend',
  },
  {
    title: 'Shared UI via design system',
    description: 'Common UI patterns (buttons, modals, forms, inputs) should be shared components, not reimplemented per feature.',
    check: 'Duplicate UI component patterns implemented in multiple feature directories',
    severity: 'warning',
    scope: 'frontend',
  },
  {
    title: 'No direct DOM manipulation',
    description: 'Use framework APIs (refs, hooks) instead of direct DOM API calls.',
    check: 'Direct document.querySelector or DOM API usage outside of explicitly scoped refs or hooks',
    severity: 'violation',
    scope: 'frontend',
  },
];

export function seedFrontend(db: DB): void {
  const now = nowIso();

  const insertRule = db.prepare(`
    INSERT INTO architecture_rules (id, title, description, "check", threshold, severity, scope, enabled, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'default', ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const rule of FRONTEND_RULES) {
      insertRule.run(
        uuidv4(), rule.title, rule.description, rule.check,
        rule.threshold ?? null, rule.severity, rule.scope ?? 'frontend', now, now
      );
    }
      db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
