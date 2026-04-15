// ─── Domain Enums ────────────────────────────────────────────────────────────

export type ProjectType = 'general' | 'frontend' | 'backend' | 'fullstack' | 'library';

export type Severity = 'info' | 'warning' | 'violation';

export type DebtSeverity = 'low' | 'medium' | 'high' | 'critical';

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type SpecStatus = 'draft' | 'active' | 'complete' | 'abandoned';

export type DebtStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved';

export type DebtCategory =
  | 'duplication'
  | 'boundary_violation'
  | 'missing_tests'
  | 'temporary_hack'
  | 'oversized_file'
  | 'unclear_abstraction'
  | 'inconsistent_naming'
  | 'performance_compromise'
  | 'missing_error_handling'
  | 'stale_dependency';

export type RuleScope = 'all' | 'frontend' | 'backend' | 'fullstack' | 'library';

export type RuleSource = 'default' | 'user';

export type ContextProfile = 'builder' | 'reviewer' | 'planner' | 'debugger';

export type HandoffMode = 'agent' | 'human' | 'sprint';

export type ExportType = 'context' | 'handoff' | 'report';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface SigilConfig {
  project: {
    name: string;
    type: ProjectType;
    description: string;
  };
  thresholds: {
    max_file_lines: number;
    max_function_lines: number;
    debt_aging_critical_days: number;
    debt_aging_high_days: number;
    debt_aging_stale_days: number;
  };
  structure: {
    feature_dirs: string[];
    shared_dirs: string[];
    test_dirs: string[];
    data_layer_dirs: string[];
    presentation_dirs: string[];
    service_dirs: string[];
    adapter_dirs: string[];
  };
  cross_feature_allowlist: string[];
  max_context_tokens: number;
  agent_files: string[];
  auto_sync: {
    enabled: boolean;
    on: string[];
  };
}

// ─── DB Row Types (raw — JSON stored as strings) ──────────────────────────────

export interface MetaRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  type: ProjectType;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface GovernanceProfileRow {
  id: string;
  name: string;
  description: string | null;
  project_type: string;
  enabled: number;
  created_at: string;
}

export interface ArchitectureRuleRow {
  id: string;
  title: string;
  description: string;
  check: string;
  threshold: string | null;
  severity: Severity;
  scope: RuleScope;
  enabled: number;
  source: RuleSource;
  created_at: string;
  updated_at: string;
}

export interface ConstraintRow {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  scope: string;
  enabled: number;
  source: RuleSource;
  created_at: string;
}

export interface AntiPatternRow {
  id: string;
  name: string;
  description: string;
  why_harmful: string;
  detection_signals: string; // JSON: string[]
  resolution: string;
  severity: 'warning' | 'violation';
  scope: string;
  enabled: number;
  source: RuleSource;
  created_at: string;
}

export interface CodePatternRow {
  id: string;
  title: string;
  purpose: string;
  when_to_use: string;
  when_not_to_use: string;
  example_paths: string | null; // JSON: string[]
  notes: string | null;
  source: RuleSource;
  created_at: string;
}

export interface FeatureSpecRow {
  id: string;
  title: string;
  goal: string;
  scope: string;
  non_goals: string | null;          // JSON: string[]
  acceptance_criteria: string | null; // JSON: string[]
  risks: string | null;              // JSON: string[]
  dependencies: string | null;       // JSON: string[]
  relevant_files: string | null;     // JSON: object
  architecture_notes: string | null;
  constraints: string | null;        // JSON: string[]
  status: SpecStatus;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  feature_spec_id: string | null;
  assigned_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface DecisionRow {
  id: string;
  title: string;
  description: string;
  rationale: string;
  alternatives_considered: string | null; // JSON: string[]
  made_by: string | null;
  related_spec_id: string | null;
  created_at: string;
}

export interface TechnicalDebtRow {
  id: string;
  title: string;
  category: DebtCategory;
  description: string;
  file: string | null;
  line_range: string | null;
  severity: DebtSeverity;
  status: DebtStatus;
  added_by: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  related_task_id: string | null;
  related_rule_id: string | null;
  estimated_effort: 'small' | 'medium' | 'large' | null;
  created_at: string;
  updated_at: string;
}

export interface ArtifactRow {
  id: string;
  timestamp: string;
  source: string;
  agent: string;
  summary: string | null;
  files_touched: string | null;   // JSON: string[]
  files_added: string | null;     // JSON: string[]
  files_removed: string | null;   // JSON: string[]
  debt_discovered: string | null; // JSON: string[]
  structure_issues: string | null;// JSON: string[]
  git_ref: string | null;
  created_at: string;
}

export interface EventRow {
  id: string;
  type: string;
  data: string | null; // JSON
  created_at: string;
}

export interface ExportRow {
  id: string;
  type: ExportType;
  profile: string | null;
  output_path: string | null;
  created_at: string;
}

// ─── Parsed Types (JSON fields expanded) ─────────────────────────────────────

export interface ParsedAntiPattern extends Omit<AntiPatternRow, 'detection_signals'> {
  detection_signals: string[];
}

export interface ParsedCodePattern extends Omit<CodePatternRow, 'example_paths'> {
  example_paths: string[];
}

export interface ParsedFeatureSpec extends Omit<FeatureSpecRow,
  'non_goals' | 'acceptance_criteria' | 'risks' | 'dependencies' | 'relevant_files' | 'constraints'
> {
  non_goals: string[];
  acceptance_criteria: string[];
  risks: string[];
  dependencies: string[];
  relevant_files: {
    primary?: string[];
    directories?: string[];
    test_files?: string[];
    config?: string[];
    related?: string[];
  };
  constraints: string[];
}

export interface ParsedDecision extends Omit<DecisionRow, 'alternatives_considered'> {
  alternatives_considered: string[];
}

export interface ParsedArtifact extends Omit<ArtifactRow,
  'files_touched' | 'files_added' | 'files_removed' | 'debt_discovered' | 'structure_issues'
> {
  files_touched: string[];
  files_added: string[];
  files_removed: string[];
  debt_discovered: string[];
  structure_issues: string[];
}

// ─── Engine Types ─────────────────────────────────────────────────────────────

export interface ContextSection {
  title: string;
  content: string;
  tokenEstimate: number;
  priority: 'always' | 'high' | 'medium' | 'low';
}

export interface AssembledContext {
  projectName: string;
  projectType: ProjectType;
  profile: ContextProfile;
  generatedAt: string;
  sections: ContextSection[];
  totalTokens: number;
  truncated: boolean;
}

export interface IngestResult {
  nothingToDo: boolean;
  filesAdded: string[];
  filesModified: string[];
  filesDeleted: string[];
  newDebtFound: number;
  oversizedFiles: string[];
  artifactId: string | null;
}

export interface CheckIssue {
  type: 'violation' | 'warning' | 'info';
  category: string;
  message: string;
  file?: string;
  line?: number;
}

export interface CheckResult {
  score: number;
  violations: number;
  warnings: number;
  infos: number;
  issues: CheckIssue[];
  checkedAt: string;
}

export interface GovernanceScore {
  score: number;
  trend: 'improving' | 'declining' | 'stable';
  checkedAt: string;
}

// ─── Seed Types ───────────────────────────────────────────────────────────────

export interface RuleSeed {
  title: string;
  description: string;
  check: string;
  threshold?: string;
  severity: Severity;
  scope?: RuleScope;
}

export interface ConstraintSeed {
  title: string;
  description: string;
  severity?: Severity;
  scope?: string;
}

export interface AntiPatternSeed {
  name: string;
  description: string;
  why_harmful: string;
  detection_signals: string[];
  resolution: string;
  severity?: 'warning' | 'violation';
  scope?: string;
}
