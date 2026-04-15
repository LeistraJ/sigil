import { DB } from '../connection';
import { v4 as uuidv4 } from 'uuid';

import { RuleSeed, ConstraintSeed, AntiPatternSeed } from '../../types';
import { nowIso, stringifyJSON } from '../../utils/format';

const UNIVERSAL_RULES: RuleSeed[] = [
  {
    title: 'No business logic in handlers',
    description: 'Business logic must not live in UI components, route handlers, or controllers. These layers delegate to services.',
    check: 'Functions in UI/route/controller files performing non-rendering logic exceed threshold',
    threshold: '20 lines',
    severity: 'violation',
  },
  {
    title: 'Isolate data access',
    description: 'Data access and persistence must be isolated from presentation and business logic layers.',
    check: 'Files in presentation layers import directly from ORM, database, or query modules',
    threshold: '0 direct imports',
    severity: 'violation',
  },
  {
    title: 'No logic duplication',
    description: 'Do not duplicate business logic across features or modules. Extract shared logic.',
    check: 'Same logical operation implemented in more than one location',
    threshold: '0 duplicates',
    severity: 'warning',
  },
  {
    title: 'Extend before creating',
    description: 'Extend existing abstractions before creating new parallel ones. Check what exists first.',
    check: 'New file/class/module created when existing one covers the use case',
    severity: 'warning',
  },
  {
    title: 'Focused modules',
    description: 'Avoid large multi-purpose files. Each module should have a single clear responsibility.',
    check: 'Any file exceeds line threshold',
    threshold: '300 lines',
    severity: 'warning',
  },
  {
    title: 'No hidden shared state',
    description: 'Do not introduce shared mutable state that is not explicitly declared and managed.',
    check: 'Module-level mutable variables accessed by multiple consumers',
    threshold: '0',
    severity: 'violation',
  },
  {
    title: 'Scoped feature logic',
    description: 'Feature logic must remain within its designated feature boundary. No reaching into other features.',
    check: 'Feature directory imports from another feature\'s internal modules',
    threshold: '0 cross-imports',
    severity: 'violation',
  },
  {
    title: 'Adapter-wrapped externals',
    description: 'External API and service access must go through defined adapter or service modules.',
    check: 'Direct HTTP/SDK calls outside of adapter or service directories',
    threshold: '0',
    severity: 'warning',
  },
  {
    title: 'Debt must be tracked',
    description: 'Temporary workarounds, hacks, and shortcuts must be logged as technical debt entries in Sigil.',
    check: 'TODO/HACK/FIXME/WORKAROUND comments without corresponding Sigil debt entry',
    threshold: '0 untracked',
    severity: 'info',
  },
  {
    title: 'Prefer existing patterns',
    description: 'Follow established project patterns. Introducing a new pattern requires a recorded decision justifying it.',
    check: 'New pattern introduced without a decision entry justifying divergence',
    severity: 'warning',
  },
  {
    title: 'No unauthorized cross-feature imports',
    description: 'Cross-feature imports are prohibited unless explicitly allowed in the cross_feature_allowlist in config.',
    check: 'Import from features/X inside features/Y without allowlist entry',
    threshold: '0',
    severity: 'violation',
  },
  {
    title: 'Framework-independent domain',
    description: 'Core domain and business logic must not depend on framework-specific APIs. Keep domain logic portable.',
    check: 'Domain or model files import framework-specific modules',
    threshold: '0',
    severity: 'warning',
  },
  {
    title: 'Integrate, don\'t parallel',
    description: 'New code must integrate into existing architecture. Do not create parallel systems for the same concern.',
    check: 'New directory structure mirrors existing one for the same concern',
    severity: 'violation',
  },
  {
    title: 'Explicit over implicit',
    description: 'Prefer explicit behavior over magic, auto-registration, or hidden side effects.',
    check: 'Functions with undeclared side effects or implicit behavior',
    severity: 'warning',
  },
  {
    title: 'Clear layer boundaries',
    description: 'Maintain clear separation between data, business logic, and presentation layers.',
    check: 'Single file serves multiple architectural layers',
    severity: 'violation',
  },
];

const UNIVERSAL_CONSTRAINTS: ConstraintSeed[] = [
  {
    title: 'No unnecessary dependencies',
    description: 'Do not add dependencies for functionality that can be reasonably implemented in-project or already exists in current dependencies.',
  },
  {
    title: 'Preserve backward compatibility',
    description: 'Do not break existing functionality or interfaces unless explicitly authorized and documented with a decision record.',
  },
  {
    title: 'Clear module boundaries',
    description: 'Every module must have a clear single responsibility. If you can\'t describe what a module does in one sentence, split it.',
  },
  {
    title: 'No silent fallback logic',
    description: 'When an operation fails, surface the failure explicitly. Do not silently fall back to default behavior that hides the problem.',
  },
  {
    title: 'Explicit over implicit',
    description: 'Prefer explicit function calls, explicit configuration, and explicit error handling over convention-based magic.',
  },
  {
    title: 'Small focused functions',
    description: 'Functions should do one thing. If a function needs a comment explaining what a section does, that section should be its own function.',
  },
  {
    title: 'Justify new patterns',
    description: 'Do not introduce a new way of doing something that already has an established pattern. If a new pattern is needed, record the decision.',
  },
  {
    title: 'No duplicate validation',
    description: 'Validation rules for a given data shape should exist in exactly one place and be reused, not reimplemented.',
  },
  {
    title: 'Code must be readable by others',
    description: 'Write code as if the next person reading it has no context. Clear naming, clear structure, minimal cleverness.',
  },
  {
    title: 'Consistency with existing structure',
    description: 'Match existing project conventions for file naming, directory structure, export patterns, and code style.',
  },
];

const UNIVERSAL_ANTI_PATTERNS: AntiPatternSeed[] = [
  {
    name: 'Duplicated business logic',
    description: 'Same logical operation implemented in multiple files or features.',
    why_harmful: 'Bug fixes must be applied in multiple places; divergence is inevitable and creates subtle bugs.',
    detection_signals: [
      'Similar function names across features',
      'Copy-pasted code blocks with minor variations',
      'Same validation rules in multiple files',
    ],
    resolution: 'Extract shared logic into a dedicated shared module scoped to the domain (e.g., shared/pricing/calculateDiscount.ts), not a generic utils dump.',
  },
  {
    name: 'Feature-specific utility dumping',
    description: 'Generic utility functions defined inside feature directories, then imported by other features.',
    why_harmful: 'Creates invisible coupling between features. Makes refactoring dangerous because dependency graph is hidden.',
    detection_signals: [
      'features/auth/utils.ts imported by features/billing/',
      'Generically-named functions (formatDate, parseInput) living inside specific feature dirs',
    ],
    resolution: 'Move truly shared utilities to a shared/ or lib/ directory. If a utility is only used by one feature, keep it there but do not export it.',
  },
  {
    name: 'Cross-layer imports',
    description: 'Presentation code imports from data layer, or data layer imports from business logic.',
    why_harmful: 'Destroys architectural boundaries. Makes it impossible to swap implementations or test layers independently.',
    detection_signals: [
      'Component file imports database model',
      'Route handler imports UI component',
      'ORM entity imported in utility module',
    ],
    resolution: 'Introduce an interface/contract layer. Presentation talks to business logic through service interfaces; business logic talks to data through repository interfaces.',
  },
  {
    name: 'God files',
    description: 'Single file handling multiple unrelated responsibilities, typically 300+ lines.',
    why_harmful: 'Merge conflicts, cognitive overload, impossible to test in isolation, hard to navigate.',
    detection_signals: [
      'Files over 300 lines',
      'Files with 5+ exported functions serving different purposes',
      'Filenames like helpers.ts, utils.ts, common.ts',
    ],
    resolution: 'Split by domain responsibility, not by arbitrary line count. A 400-line file with one cohesive purpose is fine. A 200-line file doing three unrelated things is not.',
  },
  {
    name: 'Inline business logic in UI/controllers',
    description: 'Route handlers or UI components contain business rules, calculations, or complex conditionals.',
    why_harmful: 'Cannot reuse the logic, cannot test without rendering or routing, business rules become invisible to review.',
    detection_signals: [
      'if/else chains in render functions',
      'Price calculations in API handlers',
      'Auth checks scattered across components',
    ],
    resolution: 'Extract to a dedicated service or domain function. The handler/component should only call the service and map results to response or UI.',
  },
  {
    name: 'Hidden state coupling',
    description: 'Modules share state through module-level variables, singletons, or global objects without explicit declaration.',
    why_harmful: 'Order-dependent execution, impossible to test in isolation, race conditions, mysterious bugs.',
    detection_signals: [
      'let at module scope modified by exported functions',
      'Singleton patterns without dependency injection',
      'Global/window properties for state sharing',
    ],
    resolution: 'Make state ownership explicit. Use dependency injection, context providers, or explicit state containers with clear read/write interfaces.',
  },
  {
    name: 'Untracked technical shortcuts',
    description: 'TODO, HACK, FIXME, or temporary code with no corresponding tracking entry.',
    why_harmful: 'Temporary solutions become permanent by default. No visibility into accumulated shortcuts.',
    detection_signals: [
      'TODO/HACK/FIXME comments in code',
      'Comments with \'temporary\' or \'workaround\'',
      'Hardcoded values with \'fix later\' notes',
    ],
    resolution: 'Every shortcut gets a `sigil debt add` entry at creation time. Include the file, the reason, and what the proper fix looks like.',
  },
  {
    name: 'Inconsistent naming',
    description: 'Same concept has different names across the codebase (user/account/member, create/add/insert).',
    why_harmful: 'Developers and agents cannot find related code. Assumptions about behavior diverge across the codebase.',
    detection_signals: [
      'Multiple names for the same domain concept',
      'Same operation named differently across features',
      'Inconsistent casing conventions',
    ],
    resolution: 'Establish a domain glossary as a sigil pattern entry. Refactor to canonical terms. Add a constraint: use canonical terms from the domain glossary.',
  },
];

export function seedUniversal(db: DB): void {
  const now = nowIso();

  const insertRule = db.prepare(`
    INSERT INTO architecture_rules (id, title, description, "check", threshold, severity, scope, enabled, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'all', 1, 'default', ?, ?)
  `);

  const insertConstraint = db.prepare(`
    INSERT INTO constraints (id, title, description, severity, scope, enabled, source, created_at)
    VALUES (?, ?, ?, 'warning', 'all', 1, 'default', ?)
  `);

  const insertAntiPattern = db.prepare(`
    INSERT INTO anti_patterns (id, name, description, why_harmful, detection_signals, resolution, severity, scope, enabled, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'warning', 'all', 1, 'default', ?)
  `);

  db.exec('BEGIN');
  try {
    for (const rule of UNIVERSAL_RULES) {
      insertRule.run(
        uuidv4(), rule.title, rule.description, rule.check,
        rule.threshold ?? null, rule.severity, now, now
      );
    }
    for (const constraint of UNIVERSAL_CONSTRAINTS) {
      insertConstraint.run(uuidv4(), constraint.title, constraint.description, now);
    }
    for (const ap of UNIVERSAL_ANTI_PATTERNS) {
      insertAntiPattern.run(
        uuidv4(), ap.name, ap.description, ap.why_harmful,
        stringifyJSON(ap.detection_signals), ap.resolution, now
      );
    }
      db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
