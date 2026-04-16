import { Command } from 'commander';

interface CommandEntry {
  cmd: string;
  desc: string;
}

interface Group {
  title: string;
  commands: CommandEntry[];
}

const GROUPS: Group[] = [
  {
    title: 'Setup & Session',
    commands: [
      { cmd: 'sigil setup',                              desc: 'One-time install of global auto-save hooks for every project' },
      { cmd: 'sigil session save [--note "..."]',        desc: 'Save session snapshot (auto-runs via hooks)' },
      { cmd: 'sigil resume',                             desc: 'Print session briefing — works without sigil init' },
    ],
  },
  {
    title: 'Core',
    commands: [
      { cmd: 'sigil init',                               desc: 'Initialize Sigil in the current project' },
      { cmd: 'sigil ingest [--agent <name>]',            desc: 'Scan changes, update DB, regenerate agent context files' },
      { cmd: 'sigil status',                             desc: 'Project health dashboard (tasks, debt, score)' },
      { cmd: 'sigil check [--format json|markdown]',     desc: 'Governance audit — violations, warnings, health score 0–100' },
    ],
  },
  {
    title: 'Tasks',
    commands: [
      { cmd: 'sigil task list [--status] [--priority]',  desc: 'List tasks with optional filters' },
      { cmd: 'sigil task add',                           desc: 'Add a task interactively (priority, spec link, agent)' },
      { cmd: 'sigil task update <id> --status <s>',      desc: 'Update status: todo → in_progress → blocked → done' },
      { cmd: 'sigil task update <id> --priority <p>',    desc: 'Change priority: low / medium / high / critical' },
      { cmd: 'sigil task show <id>',                     desc: 'Full task details' },
    ],
  },
  {
    title: 'Feature Specs',
    commands: [
      { cmd: 'sigil spec create',                        desc: 'Create a spec (goal, scope, acceptance criteria, risks)' },
      { cmd: 'sigil spec list [--status]',               desc: 'List specs — draft / active / complete / abandoned' },
      { cmd: 'sigil spec show <id>',                     desc: 'Full spec details including linked tasks' },
      { cmd: 'sigil spec update <id> --status <s>',      desc: 'Update spec status' },
    ],
  },
  {
    title: 'Decisions',
    commands: [
      { cmd: 'sigil decision add',                       desc: 'Record an architectural decision with rationale' },
      { cmd: 'sigil decision list [--limit <n>]',        desc: 'List decisions (most recent first)' },
      { cmd: 'sigil decision show <id>',                 desc: 'Full decision details including alternatives considered' },
    ],
  },
  {
    title: 'Technical Debt',
    commands: [
      { cmd: 'sigil debt list [--severity] [--status]',  desc: 'List open debt (default: excludes resolved)' },
      { cmd: 'sigil debt add',                           desc: 'Track a debt item (category, severity, file, effort)' },
      { cmd: 'sigil debt update <id> --status resolved', desc: 'Mark debt resolved' },
      { cmd: 'sigil debt show <id>',                     desc: 'Full debt details' },
    ],
  },
  {
    title: 'Governance Rules',
    commands: [
      { cmd: 'sigil rule list',                          desc: 'List architecture rules' },
      { cmd: 'sigil rule add',                           desc: 'Add a custom rule (severity, scope)' },
      { cmd: 'sigil rule disable <id>',                  desc: 'Disable a rule without deleting it' },
      { cmd: 'sigil rule show <id>',                     desc: 'Full rule details' },
      { cmd: 'sigil constraint list|add|show',           desc: 'Hard project constraints agents must respect' },
      { cmd: 'sigil antipattern list|add|show',          desc: 'Patterns agents must avoid (with detection signals)' },
      { cmd: 'sigil pattern list|add|show',              desc: 'Good patterns agents should follow' },
    ],
  },
  {
    title: 'Output & Export',
    commands: [
      { cmd: 'sigil export context [--profile <p>]',     desc: 'Export context file — builder / reviewer / planner / debugger' },
      { cmd: 'sigil export context --no-token-limit',    desc: 'Full context with no token budget' },
      { cmd: 'sigil handoff [--mode agent|human|sprint]','desc': 'Generate a structured handoff document' },
      { cmd: 'sigil report governance [--since 7d]',     desc: 'Governance trend report (score history, aging debt, activity)' },
      { cmd: 'sigil query "<question>"',                 desc: 'Ad-hoc question about project data' },
    ],
  },
];

export function registerHelp(program: Command): void {
  program
    .command('commands')
    .description('Show all available commands grouped by category')
    .action(() => {
      const maxCmd = GROUPS.flatMap(g => g.commands).reduce((m, c) => Math.max(m, c.cmd.length), 0);

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║                    SIGIL — ALL COMMANDS                      ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');

      for (const group of GROUPS) {
        console.log(`\n  ${group.title.toUpperCase()}`);
        console.log('  ' + '─'.repeat(60));
        for (const entry of group.commands) {
          const pad = entry.cmd.padEnd(maxCmd + 2);
          console.log(`  ${pad}  ${entry.desc}`);
        }
      }

      console.log('\n  TIPS');
      console.log('  ' + '─'.repeat(60));
      console.log('  sigil <command> --help      Show options for any command');
      console.log('  sigil <command> <sub> -h    Show options for a subcommand');
      console.log('  IDs can be shortened        e.g. sigil task show abc1 (not full UUID)');
      console.log('');
    });
}
