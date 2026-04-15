import { program } from 'commander';
import { version } from '../package.json';
import { registerInit } from './commands/init';
import { registerIngest } from './commands/ingest';
import { registerStatus } from './commands/status';
import { registerCheck } from './commands/check';
import { registerRule } from './commands/rule';
import { registerConstraint } from './commands/constraint';
import { registerAntiPattern } from './commands/antipattern';
import { registerPattern } from './commands/pattern';
import { registerSpec } from './commands/spec';
import { registerTask } from './commands/task';
import { registerDecision } from './commands/decision';
import { registerDebt } from './commands/debt';
import { registerQuery } from './commands/query';
import { registerExport } from './commands/export';
import { registerHandoff } from './commands/handoff';
import { registerReport } from './commands/report';

program
  .name('sigil')
  .description('Local-first project memory and governance engine for AI-assisted development')
  .version(version);

// Core commands
registerInit(program);
registerIngest(program);
registerStatus(program);
registerCheck(program);

// Governance CRUD
registerRule(program);
registerConstraint(program);
registerAntiPattern(program);
registerPattern(program);

// Project CRUD
registerSpec(program);
registerTask(program);
registerDecision(program);
registerDebt(program);

// Query & output
registerQuery(program);
registerExport(program);
registerHandoff(program);
registerReport(program);

// Handle unknown commands
program.on('command:*', () => {
  console.error(`Unknown command: ${program.args.join(' ')}`);
  console.error('Run `sigil --help` to see available commands.');
  process.exit(1);
});

program.parse(process.argv);
