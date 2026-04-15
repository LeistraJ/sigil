import { DB } from './connection';


const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('general','frontend','backend','fullstack','library')),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS governance_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS architecture_rules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  "check" TEXT NOT NULL,
  threshold TEXT,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','violation')),
  scope TEXT NOT NULL DEFAULT 'all' CHECK(scope IN ('all','frontend','backend','fullstack','library')),
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'default' CHECK(source IN ('default','user')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS constraints (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','violation')),
  scope TEXT NOT NULL DEFAULT 'all',
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS anti_patterns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  why_harmful TEXT NOT NULL,
  detection_signals TEXT NOT NULL,
  resolution TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('warning','violation')),
  scope TEXT NOT NULL DEFAULT 'all',
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS code_patterns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  when_to_use TEXT NOT NULL,
  when_not_to_use TEXT NOT NULL,
  example_paths TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feature_specs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  scope TEXT NOT NULL,
  non_goals TEXT,
  acceptance_criteria TEXT,
  risks TEXT,
  dependencies TEXT,
  relevant_files TEXT,
  architecture_notes TEXT,
  constraints TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','complete','abandoned')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','blocked','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
  feature_spec_id TEXT,
  assigned_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (feature_spec_id) REFERENCES feature_specs(id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rationale TEXT NOT NULL,
  alternatives_considered TEXT,
  made_by TEXT,
  related_spec_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (related_spec_id) REFERENCES feature_specs(id)
);

CREATE TABLE IF NOT EXISTS technical_debt (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'duplication','boundary_violation','missing_tests','temporary_hack',
    'oversized_file','unclear_abstraction','inconsistent_naming',
    'performance_compromise','missing_error_handling','stale_dependency'
  )),
  description TEXT NOT NULL,
  file TEXT,
  line_range TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','in_progress','resolved')),
  added_by TEXT NOT NULL DEFAULT 'unknown',
  resolved_at TEXT,
  resolution_notes TEXT,
  related_task_id TEXT,
  related_rule_id TEXT,
  estimated_effort TEXT CHECK(estimated_effort IN ('small','medium','large')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ingest',
  agent TEXT NOT NULL DEFAULT 'unknown',
  summary TEXT,
  files_touched TEXT,
  files_added TEXT,
  files_removed TEXT,
  debt_discovered TEXT,
  structure_issues TEXT,
  git_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  profile TEXT,
  output_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rules_scope ON architecture_rules(scope, enabled);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_spec ON tasks(feature_spec_id);
CREATE INDEX IF NOT EXISTS idx_debt_status ON technical_debt(status, severity);
CREATE INDEX IF NOT EXISTS idx_artifacts_ts ON artifacts(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, created_at);
`;

export function applySchema(db: DB): void {
  db.exec(SCHEMA_SQL);
}
